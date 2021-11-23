const jsonSchemaFromMSON = require('./mson_to_json_schema')
const GenerateSchema = require('generate-schema')

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
    .map((f, i) => {
        if (i === 0) {
            return f;
        }
        let include = f
            .substr(0, f.indexOf('-->')) 
            .trim()
      
        if (include.slice(-1) === ')'){
            include = include.substr(0, include.length - 1)
        }
        if (include.slice(0, 1) === '(' || include.slice(0, 1) === ':'){
            include = include.substr(1, include.length)
        }
        const restOfStr = f.substr(f.indexOf('-->') + 3, f.length)         
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

module.exports.searchDataStructure = function (contents, openApi3) {
    for (var i = 0; i < contents.length; i++) {
        var content = contents[i];
        if (content.element !== "dataStructure") continue;
        return jsonSchemaFromMSON(content, openApi3);
    }
};

module.exports.generateSchemaFromExample = function (headers, example, openApi3) {
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
        if (!openApi3) {
            if (scheme['type'] === 'object') {
                scheme.example = body;
            } else if (scheme['type'] === 'array') {
                scheme.items.example = body;
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