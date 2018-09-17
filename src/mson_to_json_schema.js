var escapeJSONPointer = require('./escape_json_pointer');

function convertMsonToJsonSchema(content) {
    // for apib._version = "4.0"
    var mson = content.content[0];
    return convert(mson);
}

function convert(mson) {
    // mson.element = "boolean", "string", "number", "array", "enum", "object", CustomType
    switch (mson.element) {
        case 'array':
            if (!mson.content || mson.content.length === 0) {
                return { type: 'array', items: {} };
            } else if (mson.content.length === 1) {
                return { type: 'array', items: convert(mson.content[0]) };
            } else if (mson.content.length > 1) {
                return { type: 'array', items: { 'anyOf': mson.content.map(convert) } };
            }
        case 'enum':
            return convertEnum(mson.content);
        case 'object':
            break;
        case 'boolean':
        case 'string':
        case 'number':
            return { type: mson.element };
        default:
            if (!mson.content) {
                return { '$ref': '#/definitions/' + escapeJSONPointer(mson.element) };
            }
            break;
    }
    // object
    var schema = {};
    schema.type = 'object';
    schema.required = [];
    schema.properties = {};
    for (var j = 0; mson.content && j < mson.content.length; j++) {
        var member = mson.content[j];
        if (member.element !== "member") continue;
        // MEMO: member.meta.description
        schema.properties[member.content.key.content] = convert(member.content.value);
        if (!member.attributes || !member.attributes.typeAttributes) continue;
        for (var k = 0; k < member.attributes.typeAttributes.length; k++) {
            if (member.attributes.typeAttributes[k] === "fixedType") {
                // handle when we have attributes containing objects
                if (member.content.value.element === 'array') {
                    schema.properties[member.content.key.content] = {
                        'type': "array",
                        'items': {
                            '$ref': '#/definitions/' + escapeJSONPointer(member.content.value.content[0].element)
                        }
                    };
                } else {
                    schema.properties[member.content.key.content] = { '$ref': '#/definitions/' + escapeJSONPointer(member.content.value.element) };
                }
            }
            if (member.attributes.typeAttributes[k] === "required") {
                schema.required.push(member.content.key.content);
            }
        }
    }

    // According to schema definition, required is a stringArray, which must be non-empty
    if (schema.required.length === 0) {
        delete schema.required
    }

    if (mson.element !== 'object') {
        return { 'allOf': [{ '$ref': '#/definitions/' + escapeJSONPointer(mson.element) }, schema] };
    }

    return schema;
}

function convertEnum(contents) {
    var schema = { type: '', enum: [] };
    for (var i = 0; i < contents.length; i++) {
        var content = contents[i];
        if (!schema.type) {
            schema.type = content.element;
        } else if (schema.type != content.element) {
            // WARN!! mixed type enum
        }
        schema.enum.push(content.content);
    }
    return schema;
}

module.exports = convertMsonToJsonSchema;