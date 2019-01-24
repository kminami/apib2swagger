var url = require('url'),
    http = require('http'),
    drafter = require('drafter.js'),
    UriTemplate = require('uritemplate'),
    GenerateSchema = require('generate-schema');

var jsonSchemaFromMSON = require('./src/mson_to_json_schema'),
    escapeJSONPointer = require('./src/escape_json_pointer');

var apib2swagger = module.exports.convertParsed = function(apib, options) {
    //console.log(JSON.stringify(apib, null, 4));
    var swagger = {};
    swagger.swagger = '2.0';
    swagger.info = {
        'title': apib.name,
        'version': '',
        'description': apib.description
    }
    apib.metadata.forEach(function(meta) {
        //console.log(meta);
        if (meta.name.toLowerCase() === 'host') {
            var urlParts = url.parse(meta.value);
            swagger.host = urlParts.host;
            swagger.basePath = urlParts.pathname;
            swagger.schemes = [urlParts.protocol.replace(':','')];
        } else if (meta.name.toLowerCase() === 'version') {
            swagger.info.version = meta.value;
        }
    });
    swagger.paths = {};
    swagger.definitions = {};
    swagger.securityDefinitions = {};
    var converterContext = { swagger: swagger, options: options };
    var tags = {};
    apib.content.filter(function(content) {
        return content.element === 'category';
    }).forEach(function(category) {
        var groupName = category.attributes ? category.attributes.name : '';
        if (groupName && !tags[groupName]) {
            tags[groupName] = { name: groupName };
        }
        category.content.forEach(function(content) {
            if (content.element === 'resource') {
                // (name, description) in Resource section are discarded
                swaggerDefinitions(swagger.definitions, content);
                swaggerPaths(converterContext, groupName, content);
            } else if (content.element === 'copy') {
                // group description here
                tags[groupName].description = content.content;
            } else if (content.element === 'dataStructure') {
                swagger.definitions[content.content[0].meta.id] = jsonSchemaFromMSON(content);
            }
        });
    });
    swagger.tags = [];
    for (var key in tags) {
        swagger.tags.push(tags[key]);
    }
    return swagger;
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

var swaggerDefinitions = function (definitions, resource) {
    var scheme;
    if (resource.name) {
        scheme = searchDataStructure(resource.content); // Attributes 1
        definitions[resource.name] = scheme ? scheme : {};
    }
    if (resource.model.content && resource.model.name) {
        scheme = searchDataStructure(resource.model.content); // Attribute 2
        definitions[resource.model.name + 'Model'] = scheme ? scheme : {};
    }
};

var swaggerPaths = function (context, tag, resource) {
    var paths = context.swagger.paths;
    var uriTemplate = UriTemplate.parse(resource.uriTemplate),
        pathName = swaggerPathName(uriTemplate);
    //path.parameters = swaggerParameters(resource.parameters, uriTemplate);
    var pathParams = swaggerParameters(resource.parameters, uriTemplate); // for swagger ui
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
        'responses': swaggerResponses(action.examples, context.options),
        'summary': action.name,
        'description': action.description,
        'tags': tag ? [tag] : [],
        'parameters': pathParams.concat(swaggerParameters(action.parameters, uriTemplate))
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
    // body parameter (schema)
    var schema = [],
        scheme = searchDataStructure(action.content); // Attributes 3
    if (scheme) schema.push(scheme);
    for (var j = 0; j < action.examples.length; j++) {
        var example = action.examples[j];
        for (var l = 0; l < example.requests.length; l++) {
            var request = example.requests[l];

            // TODO should apply to Model Section?
            var security = swaggerSecurity(context, request.headers);
            if (security) {
                if (!operation.security) {
                    operation.security = [security];
                } else {
                    // TODO remove duplications
                    operation.security.push(security);
                }
            }

            var headers = swaggerHeaders(context, request.headers);
            if (headers) {
                const existingHeaders = operation.parameters
                    .filter(param => param.in === 'header')
                    .map(param => param.name.toLowerCase());
                const nonDuplicateHeaders = headers.filter(header => !existingHeaders.includes(header.name.toLowerCase()));
                operation.parameters = operation.parameters.concat(nonDuplicateHeaders);
            }

            if (request.schema) { // Schema section in Request section
                try {
                    // referencing Model's Schema is also here (no need to referencing defenitions)
                    scheme = JSON.parse(request.schema);
                    delete scheme['$schema'];

                    // if we have example values in the body then insert them into the json schema
                    var body = JSON.parse(request.body);
                    if(scheme['type'] === 'object'){
                        scheme.example = body;
                    } else if (scheme['type'] === 'array'){
                        scheme.items.example = body;
                    }
                    if (scheme) schema.push(scheme);
                } catch (e) {}
            } else {
                scheme = searchDataStructure(request.content); // Attributes 4
                if (scheme) schema.push(scheme);
                if (request.reference) {
                    schema.push({'$ref': '#/definitions/' + escapeJSONPointer(request.reference.id + 'Model')});
                }
                // fall back to body
                if (request.body && (schema == null || schema.length == 0)) {
                    for (var n = 0; n < request.headers.length; n++) {
                        var header = request.headers[n];
                        //swaggerResponse.headers[header.name] = {'type':'string'}
                        if (header.name === 'Content-Type') {
                            if (header.value.match(/application\/.*json/)) {
                                try {
                                    scheme = GenerateSchema.json("", JSON.parse(request.body));
                                    if (scheme) {
                                        delete scheme.title;
                                        delete scheme.$schema;

                                        // if we have example values in the body then insert them into the json schema
                                        var body = JSON.parse(request.body);
                                        if(scheme['type'] === 'object'){
                                            scheme.example = body;
                                        } else if (scheme['type'] === 'array'){
                                            scheme.items.example = body;
                                        }
                                        schema.push(scheme);
                                    }
                                    break;
                                } catch (e) {}
                            }
                        }
                    }
                }
            }
        }
    }
    if (schema.length == 1) {
        operation.parameters.push({name: 'body', in: 'body', schema: schema[0]});
    } else if (schema.length > 1) {
        operation.parameters.push({name: 'body', in: 'body', schema: {anyOf: schema}});
    }
    return operation;
}

var swaggerHeaders = function(context, headers) {
    var params = [];
    const skipParams = ['content-type', 'authorization']; // handled in another way
    for (let i = 0; i < headers.length; i++) {
        const element =  headers[i];
        if (skipParams.includes(element.name.toLowerCase())) continue;
        var param = {
            'name': element.name, 
            'in': 'header',
            'description': `e.g. ${element.value}`,
            'required': false,
            'x-example': element.value,
            'type': 'string' // TODO: string, number, boolean, integer, array
        };
        params.push(param);
    }
    return params;
};

// generate security and securityDefinitions from authorization headers
function swaggerSecurity(context, headers) {
    var security = null;
    headers.filter(function(header) {
        return header.name.toLowerCase() === 'authorization';
    }).forEach(function(header) {
        if (header.value.match(/^Basic /)) {
            if (!security) security = {};
            security['basic'] = [];
            context.swagger.securityDefinitions['basic'] = { type: 'basic' };
        } else if (header.value.match(/^Bearer /)) {
            if (!security) security = {};
            if (context.options.bearerAsApikey) {
                security['bearer'] = [];
                context.swagger.securityDefinitions['bearer'] = {
                    type: 'apiKey', in: 'header', name: 'Authorization'
                };
            } else {
                security['oauth2'] = [];
                context.swagger.securityDefinitions['oauth2'] = {
                    type: 'oauth2', flow: 'accessCode',
                    authorizationUrl: '', tokenUrl: '', scopes: {} };
            }
        }
    });
    return security;
}

function swaggerParameters(parameters, uriTemplate) {
    var PARAM_TYPES = {
        'string': 'string',
        'number': 'number',
        'integer': 'integer',
        'boolean': 'boolean', 'bool': 'boolean',
        'array': 'array',
        'file': 'file'
    }
    var params = [];
    //console.log(parameters);
    for (var l = 0; l < parameters.length; l++) {
        var parameter = parameters[l];
        //console.log(parameter);
        // in = ["query", "header", "path", "formData", "body"]
        var param = {
            'name': parameter.name,
            'in': getParamType(parameter.name, uriTemplate),
            'description': parameter.description,
            'required': parameter.required
        };

        if (parameter.example){
            param['x-example'] = parameter.example
        }

        var paramType = undefined;
        if (PARAM_TYPES.hasOwnProperty(parameter.type)) {
            paramType = PARAM_TYPES[parameter.type];
        } else {
            paramType = 'string';
        }

        var allowedValues = []
        for (var j = 0; j < parameter.values.length; j++) {
            allowedValues.push(parameter.values[j].value);
        }

        var parameterDefault = undefined;
        if (parameter.default) {
            if (paramType === 'number' || paramType === 'integer') {
                parameterDefault = Number(parameter.default);
            } else {
                parameterDefault = parameter.default;
            }
        }

        // Body parameters has all info in schema
        if (param.in === 'body') {
            param.schema = {
                'type': paramType
            }
            if (allowedValues.length > 0) {
                param.schema.enum = allowedValues;
            }
            if (parameterDefault) {
              param.schema.default = parameterDefault;
            }
        }
        else {
          param.type = paramType;
          if (parameterDefault) {
              param.default = parameterDefault;
          }
          if (allowedValues.length > 0) {
            param.enum = allowedValues;
          }
        }
        params.push(param);
    }
    return params;
}

var searchDataStructure = function (contents) {
    for (var i = 0; i < contents.length; i++) {
        var content = contents[i];
        if (content.element !== "dataStructure") continue;
        return jsonSchemaFromMSON(content);
    }
};

function getParamType(name, uriTemplate) {
    if (!uriTemplate) return 'body';
    for (var i = 0; i < uriTemplate.expressions.length; i++) {
        var exp = uriTemplate.expressions[i];
        if (!exp.varspecs) continue;
        for (var j = 0; j < exp.varspecs.length; j++) {
            var spec = exp.varspecs[j];
            if (spec.varname === name) {
                return exp.operator.symbol === '?' ? 'query' : 'path';
            }
        }
    }
    return 'body'; // TODO: decide 'header', 'formData', 'body'
}

function fixArraySchema(schema) {
    if (schema.type === 'array') {
        if (!schema.hasOwnProperty('items')) schema.items = {};
    } else if (schema.type === 'object') {
        for (var k in schema.properties) fixArraySchema(schema.properties[k]);
    }
}

function swaggerResponses(examples, options) {
    var responses = {};
    //console.log(examples);
    for (var l = 0; l < examples.length; l++) {
        var example = examples[l];
        //console.log(example);
        for (var m = 0; m < example.responses.length; m++) {
            var response = example.responses[m];
            //console.log(response);
            var swaggerResponse = {
                "description": response.description || http.STATUS_CODES[response.name],
                "headers": {},
                "examples": {}
            };
            if (options.preferReference) { // MSON then schema
                var schema = searchDataStructure(response.content); // Attributes in response
                if (schema) {
                    swaggerResponse.schema = schema;
                } else if (response.schema) {
                    try {
                        swaggerResponse.schema = JSON.parse(response.schema);
                        delete swaggerResponse.schema['$schema'];
                        fixArraySchema(swaggerResponse.schema); // work around for Swagger UI / Editor
                    } catch (e) {}
                }
            } else { // schema then MSON
                if (response.schema) {
                    try {
                        swaggerResponse.schema = JSON.parse(response.schema);
                        delete swaggerResponse.schema['$schema'];
                        fixArraySchema(swaggerResponse.schema); // work around for Swagger UI / Editor
                    } catch (e) {}
                }
                if (!swaggerResponse.schema) {
                    var schema = searchDataStructure(response.content); // Attributes in response
                    if (schema) swaggerResponse.schema = schema;
                }
            }
            if (!swaggerResponse.schema) {
                // fall back to body
                // if (response.body) {
                //     schema = GenerateSchema.json("", JSON.parse(response.body));
                //     if (schema) {
                //         delete schema.title;
                //         delete schema.$schema;
                //         swaggerResponse.schema = schema;
                //     }
                // }

                // use object
                // if (response.body) {
                //     swaggerResponse.schema = {type: "object"};
                // }
            }
            for (var n = 0; n < response.headers.length; n++) {
                var header = response.headers[n];
                //swaggerResponse.headers[header.name] = {'type':'string'}
                if (header.name === 'Content-Type') {
                    if (header.value.match(/application\/.*json/)) {
                        try {
                            swaggerResponse.examples[header.value] = JSON.parse(response.body);
                            //swaggerResponse.schema = {type: "object"};
                        } catch (e) {}
                        continue;
                    }
                    swaggerResponse.examples[header.value] = response.body;
                }
            }
            responses[response.name] = swaggerResponse;
        }
    }
    return responses;
}

exports.noconvert = function (data, callback) {
    try {
        var result = drafter.parse(data, {type: 'ast'});
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
        var result = drafter.parse(data, {type: 'ast'});
        //for (var i = 0; i < result.warnings.length; i++) {
        //    var warn = result.warnings[i];
        //    console.log(warn);
        //}
        var swagger = apib2swagger(result.ast, options);
        return callback(null, {swagger: swagger});
    }
    catch (error) {
        return callback(error, {});
    }
};
