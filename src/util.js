const jsonSchemaFromMSON = require('./mson_to_json_schema')
const GenerateSchema = require('generate-schema')
const path = require('path')
const fs = require('fs')

module.exports.hasFileRef = (section) => section
    .replace(/\s+/g, '') // remove spaces
    .includes('<!--include')

/* 
  Takes a string with many includes and normalizes all of the includes so that the contents
  can be imported or references to files can be created properly.
  Includes input formats
     <!-- include: path/to/file -->
     <!-- include(path/to/file) -->
     <!-- include(path/to/file -->
  Includes output format <!-- include(path/to/file) -->
*/
module.exports.normalizeIncludes = (str) => str
    .split('<!-- include')
    .map((s, i) => {
        if (i === 0) {
            return s;
        }
        let include = s
            .substr(0, s.indexOf('-->')) 
            .trim()
      
        if (include.slice(-1) === ')'){
            include = include.substr(0, include.length - 1)
        }
        if (include.slice(0, 1) === '(' || include.slice(0, 1) === ':'){
            include = include.substr(1, include.length)
        }
        const restOfStr = s.substr(s.indexOf('-->') + 3, s.length)         
        return include.trim() + ') -->' + restOfStr
    })
    .join('<!-- include('); 

// Return a reference object to the file path from the include statement.
// Even though includes should now be normalized, this handles a scenario where they may not be.
module.exports.getRefFromInclude = (include) => {
    let path = include.replace(/\s+/g, '') 
    if (path.includes('include(') && path.includes('-->')) {
        path = path.substring(
            path.indexOf('(') + 1,
            path.indexOf('-->')
        )
        // the closing paren is optional so we remove it if it is there.
        const lastChar = path.slice(-1)
        if (lastChar === ')'){
            path = path.substring(0, path.length - 1)
        }
    } else if (path.includes('include:') && path.includes('-->')) {
        path = path.substring(
            path.indexOf(':') + 1,
            path.indexOf('-->')
        )
    } else {
        throw Error('Invalid include syntax:' + include)
    }

    return { $ref: path }
}

module.exports.searchDataStructure = function (contents, options) {
    for (var i = 0; i < contents.length; i++) {
        var content = contents[i];
        if (content.element !== "dataStructure") continue;
        return jsonSchemaFromMSON(content, options);
    }
};

module.exports.generateSchemaFromExample = function (headers, example, options) {
    if (!headers || !headers.some(header => (
        header.name === 'Content-Type' && header.value.match(/application\/.*json/)
    ))) {
        return null;
    }
    try {
        const body = JSON.parse(example);
        const scheme = GenerateSchema.json("", body);
        if (!scheme) {
            return null;
        }
        delete scheme.title;
        delete scheme.$schema;
        // if we have example values in the body then insert them into the json schema
        if (!options.openApi3) {
            if (scheme['type'] === 'object' || scheme['type'] === 'array') {
                scheme.example = body;
            }
        }
        return scheme;
    } catch (e) {
        return null;
    }
}

const fixArraySchema = function (schema) {
    if (schema.type === 'array') {
        if (!schema.hasOwnProperty('items')) schema.items = {};
    } else if (schema.type === 'object') {
        for (var k in schema.properties) fixArraySchema(schema.properties[k]);
    }
}
module.exports.fixArraySchema = fixArraySchema

// Walk every subschema of a JSON Schema, applying fn to each one.
const walkSchema = function (schema, fn) {
    if (!schema || typeof schema !== 'object') return;
    fn(schema);
    if (schema.properties) {
        for (var k in schema.properties) walkSchema(schema.properties[k], fn);
    }
    if (schema.items && typeof schema.items === 'object') {
        walkSchema(schema.items, fn);
    }
    ['allOf', 'anyOf', 'oneOf'].forEach(function (key) {
        if (Array.isArray(schema[key])) schema[key].forEach(function (sub) { walkSchema(sub, fn); });
    });
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        walkSchema(schema.additionalProperties, fn);
    }
}

// The MSON converter (src/mson_to_json_schema.js) emits JSON Schema
// draft-04, where a nullable member is a type array containing 'null'
// (e.g. ["string", "null"]) or, for a referenced type, a
// {oneOf: [schema, {type: 'null'}]} pair. Neither form is valid in
// Swagger 2.0, so every schema entering a Swagger 2.0 document is passed
// through this conversion: the remaining type(s) plus x-nullable, and
// the oneOf pair becomes an allOf wrapping plus x-nullable.
// A type array of only ["null"] is left alone, as is a standalone
// {type: 'null'} (a different, pre-existing quirk).
const fixNullableSchema = function (schema) {
    walkSchema(schema, function (sub) {
        if (Array.isArray(sub.type) && sub.type.includes('null')) {
            var types = sub.type.filter(function (t) { return t !== 'null'; });
            if (types.length >= 1) {
                sub.type = types.length === 1 ? types[0] : types;
                sub['x-nullable'] = true;
            }
        }
        if (Array.isArray(sub.oneOf) && sub.oneOf.length === 2) {
            var nullIndex = sub.oneOf.findIndex(function (branch) {
                return branch && branch.type === 'null' && Object.keys(branch).length === 1;
            });
            if (nullIndex !== -1) {
                var other = sub.oneOf[1 - nullIndex];
                delete sub.oneOf;
                sub.allOf = [other];
                sub['x-nullable'] = true;
            }
        }
    });
    return schema;
}
module.exports.fixNullableSchema = fixNullableSchema

// Convert a JSON Schema draft-04 schema to an OpenAPI 3.0 schema.
// json-schema-to-openapi-schema already turns a nullable type array
// into a single type plus nullable: true, but it converts the
// {type: 'null'} branch of a oneOf pair into a bare {nullable: true}
// branch, which is not a valid schema; rewrite that pair into an
// allOf wrapping plus nullable: true, as on the Swagger 2.0 side.
const jsonSchemaToOpenApi = require('json-schema-to-openapi-schema')
const fixConvertedNullableSchema = function (schema) {
    walkSchema(schema, function (sub) {
        if (Array.isArray(sub.oneOf) && sub.oneOf.length === 2) {
            var nullIndex = sub.oneOf.findIndex(function (branch) {
                return branch && branch.nullable === true && Object.keys(branch).length === 1;
            });
            if (nullIndex !== -1) {
                var other = sub.oneOf[1 - nullIndex];
                delete sub.oneOf;
                sub.allOf = [other];
                sub.nullable = true;
            }
        }
    });
    return schema;
}
module.exports.jsonSchemaToOpenApi3 = function (schema) {
    return fixConvertedNullableSchema(jsonSchemaToOpenApi(schema));
}

module.exports.getAbsolutePath = function (options, filePath) {
    const sd = options['source-dir']
    const directory = sd ? path.normalize(sd) : null
    let absolutePath 
    if (directory) {
        absolutePath = path.join(directory, filePath) // Try given (source-dir) directory
        if (fs.existsSync(absolutePath)) return absolutePath
    }
    
    absolutePath = path.join(process.cwd(), filePath) // Try execution location's directory
    if (fs.existsSync(absolutePath)) return absolutePath
    
    absolutePath = path.join(path.dirname(options.input || ''), filePath) // Try input file's directory
    if (fs.existsSync(absolutePath)) return absolutePath

    return null
}