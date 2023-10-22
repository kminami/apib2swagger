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
            return convertEnum(mson.content, componentsPath);
        case 'object':
            break;
        case 'boolean':
        case 'string':
        case 'number':
            if (mson.content) {
                return { type: mson.element, example: mson.content };
            }
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
        const member = mson.content[j];
        if (member.element !== "member") continue;
        var propertySchema = convert(member.content.value, options);
        if (member.meta && member.meta.description) {
            propertySchema.description = member.meta.description;
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
                        if (propertySchema.$ref) {
                            propertySchema = {oneOf: [propertySchema, {type: 'null'}]};
                        } else {
                            propertySchema.type = [propertySchema.type, 'null']
                        }
                        break;
                }
            });
        }
        if (propertySchema.type === 'array' && !fixedType) {
            propertySchema.items = {}; // reset item schema
        }
        schema.properties[member.content.key.content] = propertySchema;
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

function convertEnum(contents, componentsPath) {
    if (!contents) return null
    const schemaList = []
    for (var i = 0; i < contents.length; i++) {
        var content = contents[i];
        switch (content.element) {
        case "boolean":
        case "string":
        case "number":
        case "array":
        case "enum": // TODO
        case "object":
            let schema = schemaList.find(v => v.type === content.element)
            if (!schema) {
                schema = { type: content.element, enum: [] }
                schemaList.push(schema)
            }
            schema.enum.push(content.content)
            break
        default: // CustomType
            schemaList.push({ '$ref': componentsPath + escapeJSONPointer(content.element) })
            break
        }
    }
    switch (schemaList.length) {
    case 0:
        return {}
    case 1:
        return schemaList[0]
    default:
        return { oneOf: schemaList}
    }
}

module.exports = convertMsonToJsonSchema;