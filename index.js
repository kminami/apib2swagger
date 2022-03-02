var url = require('url'),
    drafter = require('drafter.js'),
    UriTemplate = require('uritemplate'),
    jsonSchemaFromMSON = require('./src/mson_to_json_schema');

const { searchDataStructure, generateSchemaFromExample } = require('./src/util')
const { processRequests } = require('./src/requests')
const { processResponses } = require('./src/responses')
const { processParameters } = require('./src/parameters')
const toOpenApi = require('json-schema-to-openapi-schema')

var apib2swagger = module.exports.convertParsed = function (apib, options) {
    const { openApi3, infoTitle } = options
    var output = {};
    if (openApi3) {
        output.openapi = '3.0.3';
    } else {
        output.swagger = '2.0';
    }
    output.info = {
        'title': infoTitle || apib.name,
        'version': openApi3 ? '1.0.0' : '',
        'description': apib.description
    }
    apib.metadata.forEach(function (meta) {
        if (meta.name.toLowerCase() === 'host') {
            if (openApi3) {
                output.servers = [
                    {
                        url: meta.value
                    }
                ];
            } else {
                var urlParts = url.parse(meta.value);
                output.host = urlParts.host;
                output.basePath = urlParts.pathname;
                output.schemes = [urlParts.protocol.replace(':', '')];
            }
        }
        if (meta.name.toLowerCase() === 'version' && meta.value) {
            output.info.version = meta.value
        }
    });
    output.paths = {};

    if (openApi3) {
        output.components = { schemas: {} }
    } else {
        output.definitions = {}
        output.securityDefinitions = {};
    }

    var converterContext = { swagger: output, options: options };
    var tags = {};
    apib.content.filter(function (content) {
        return content.element === 'category';
    }).forEach(function (category) {
        var groupName = category.attributes ? category.attributes.name : '';
        if (groupName && !tags[groupName]) {
            tags[groupName] = { name: groupName };
        }
        category.content.forEach(function (content) {
            if (content.element === 'resource') {
                // (name, description) in Resource section are discarded
                const definitions = swaggerDefinitions(content, options);
                if (openApi3) {
                    output.components.schemas = { ...output.components.schemas, ...definitions }
                } else {
                    output.definitions = { ...output.definitions, ...definitions }
                }
                swaggerPaths(converterContext, groupName, content);
            } else if (content.element === 'copy') {
                // group description here
                tags[groupName].description = content.content;
            } else if (content.element === 'dataStructure') {
                const { id } = content.content[0].meta
                const schema = jsonSchemaFromMSON(content, options);
                if (openApi3) {
                    output.components.schemas[id] = toOpenApi(schema)
                } else {
                    output.definitions[id] = schema
                }
            }
        });
    });
    output.tags = [];
    for (var key in tags) {
        output.tags.push(tags[key]);
    }
    return output;
}

function swaggerPathName(uriTemplate) {
    var params = {};
    for (var i = 0; i < uriTemplate.expressions.length; i++) {
        var exp = uriTemplate.expressions[i];
        if (!exp.varspecs) continue;
        if (exp.operator.symbol === '?') continue; // query
        for (var j = 0; j < exp.varspecs.length; j++) {
            var spec = exp.varspecs[j];
            params[spec.varname] = '{' + spec.varname + '}';
        }
    }
    return decodeURIComponent(uriTemplate.expand(params));
}

var swaggerDefinitions = function (resource, options) {
    var scheme;
    const result = {}
    const { openApi3 } = options
    if (resource.name) {
        scheme = searchDataStructure(resource.content, options); // Attributes 1
        if (openApi3) {
            if (scheme) {
                result[resource.name] = toOpenApi(scheme)
            }
        } else {
            result[resource.name] = scheme ? scheme : {};
        }
    }
    const model = resource.model;
    if (model.content && model.name) {
        scheme = searchDataStructure(model.content, options); // Attribute 2
        // fall back to body
        if (!scheme && model.content.length > 0) {
            scheme = generateSchemaFromExample(model.headers, model.content[0].content, options);
        }
        if (openApi3) {
            if (scheme) {
                result[model.name + 'Model'] = toOpenApi(scheme)
            }
        } else {
            result[model.name + 'Model'] = scheme ? scheme : {};
        }
    }
    return result
};

var swaggerPaths = function (context, tag, resource) {
    var paths = context.swagger.paths;
    var uriTemplate = UriTemplate.parse(resource.uriTemplate),
        pathName = swaggerPathName(uriTemplate);
    var pathParams = processParameters(resource.parameters, uriTemplate, context.options); // for swagger ui
    for (var k = 0; k < resource.actions.length; k++) {
        var action = resource.actions[k];
        if (!action.attributes.uriTemplate) {
            if (!paths[pathName]) paths[pathName] = {};
            paths[pathName][action.method.toLowerCase()] = swaggerOperation(context, pathParams, uriTemplate, action, tag);
            continue;
        }
        var attrUriTemplate = UriTemplate.parse(action.attributes.uriTemplate),
            attrPathName = swaggerPathName(attrUriTemplate);
        if (!paths[attrPathName]) paths[attrPathName] = {};
        paths[attrPathName][action.method.toLowerCase()] = swaggerOperation(context, [], attrUriTemplate, action, tag);
    }
};

var swaggerOperation = function (context, pathParams, uriTemplate, action, tag) {
    var operation = {
        'responses': processResponses(action.examples, context.options),
        'summary': action.name,
        'operationId': action.name,
        'description': action.description,
        'tags': tag ? [tag] : [],
        'parameters': pathParams.concat(processParameters(action.parameters, uriTemplate, context.options))
    };
    var produces = {}, producesExist = false;
    for (var key in operation.responses) {
        var response = operation.responses[key];
        for (var mime in response.examples) {
            producesExist = true;
            produces[mime] = true;
        }
    }
    if (producesExist) {
        operation.produces = [];
        for (var mime in produces) {
            operation.produces.push(mime);
        }
    }
    return processRequests(operation, action, context)
}

exports.noconvert = function (data, callback) {
    try {
        var result = drafter.parse(data, { type: 'ast' });
        return callback(null, result);
    } catch (error) {
        return callback(error, {});
    }
};

exports.convert = function (data, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    try {
        var result = drafter.parse(data, { type: 'ast' });
        var swagger = apib2swagger(result.ast, options);
        return callback(null, { swagger: swagger });
    }
    catch (error) {
        return callback(error, {});
    }
};
