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