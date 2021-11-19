const jsonSchemaFromMSON = require('./mson_to_json_schema')
const GenerateSchema = require('generate-schema')

module.exports.hasFileRef = (section) => section
    .replace(/\s+/g, '') // remove spaces
    .includes('<!--include')

// Return a reference object to the file path from the include statement.
module.exports.getRefFromInclude = (include) => {
    var path
    if (include.includes('(') && include.includes(')')) {
        path = include.substring(
            include.indexOf('(') + 1,
            include.indexOf(')')
        )
    } else if (include.includes(':') && include.includes('-->')) {
        path = include.substring(
            include.indexOf(':') + 1,
            include.indexOf('-->')
        )
    } else {
        throw Error('Invalid include syntax.', include)
    }

    return { $ref: path.trim() }
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