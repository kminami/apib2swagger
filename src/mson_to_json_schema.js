var escapeJSONPointer = require('./escape_json_pointer');

function convertMsonToJsonSchema(content, options) {
    // for apib._version = "4.0"
    var mson = content.content[0];
    var schema = convert(mson, options);
    if (schema.type === 'array') {
        var fixedType = false;
        if (mson.attributes && mson.attributes.typeAttributes) {
            fixedType = mson.attributes.typeAttributes.some(function (typeAttr) {
                return typeAttr === 'fixedType';
            });
        }
        if (!fixedType) {
            return { type: 'array', items: {} }; // reset items schema
        }
    }
    return schema;
}

function convert(mson, options) {
    const { openApi3 } = options
    const componentsPath = openApi3 ? '#/components/schemas/' : '#/definitions/'
    // mson.element = "boolean", "string", "number", "array", "enum", "object", CustomType
    switch (mson.element) {
        case 'array':
            if (!mson.content || mson.content.length === 0) {
                return { type: 'array', items: {} };
            } else if (mson.content.length === 1) {
                return { type: 'array', items: convert(mson.content[0], options) };
            } else if (mson.content.length > 1) {
                return { type: 'array', items: { 'anyOf': mson.content.map((m) => convert(m, options)) } };
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
                return { '$ref': componentsPath + escapeJSONPointer(mson.element) };
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
        schema.properties[member.content.key.content] = convert(member.content.value, options);
        if (member.meta && member.meta.description) {
            schema.properties[member.content.key.content].description = member.meta.description;
        }
        var fixedType = false;
        if (member.attributes && member.attributes.typeAttributes) {
            member.attributes.typeAttributes.forEach(function (typeAttr) {
                switch (typeAttr) {
                    case 'fixedType':
                        fixedType = true;
                        break;
                    case 'required':
                        schema.required.push(member.content.key.content);
                        break;
                    case 'nullable':
                        schema.properties[member.content.key.content].type = [schema.properties[member.content.key.content].type, 'null']
                        break;
                }
            });
        }
        if (schema.properties[member.content.key.content].type === 'array' && !fixedType) {
            schema.properties[member.content.key.content].items = {}; // reset item schema
        }
    }

    // According to schema definition, required is a stringArray, which must be non-empty
    if (schema.required.length === 0) {
        delete schema.required
    }

    if (mson.element !== 'object') {
        return { 'allOf': [{ '$ref': componentsPath + escapeJSONPointer(mson.element) }, schema] };
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