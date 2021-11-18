var url = require('url'),
    http = require('http'),
    drafter = require('drafter.js'),
    UriTemplate = require('uritemplate'),
    GenerateSchema = require('generate-schema'),
    isEqual = require('lodash.isequal');

var jsonSchemaFromMSON = require('./src/mson_to_json_schema'),
    escapeJSONPointer = require('./src/escape_json_pointer');

var apib2swagger = module.exports.convertParsed = function (apib, options) {
    //console.log(JSON.stringify(apib, null, 4));
    const { useOpenApi3 } = options
    var output = {};
    if (useOpenApi3) {
        output.openapi = '3.0.3';
    } else {
        output.swagger = '2.0';
    }
    output.info = {
        'title': options.infoTitle || apib.name,
        'version': options.useOpenApi3 ? '1.0.0' : '',
        'description': apib.description
    }
    apib.metadata.forEach(function (meta) {
        //console.log(meta);
        if (meta.name.toLowerCase() === 'host') {
            if (options.useOpenApi3) {
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
        if (meta.name.toLowerCase() === 'version') {
            output.info.version = meta.value || '1.0.0'
        }
    });
    output.paths = {};
    if (useOpenApi3) {
        output.components = { schemas: {} }
    } else {
        output.definitions = {}
    }
    output.securityDefinitions = {};
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
                const definitions = swaggerDefinitions(content, options.useOpenApi3);
                if (useOpenApi3) {
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
                const schema = jsonSchemaFromMSON(content, useOpenApi3);
                if (useOpenApi3) {
                    output.components.schemas[id] = schema
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

var swaggerDefinitions = function (resource, useOpenApi3) {
    var scheme;
    const result = {}
    if (resource.name) {
        scheme = searchDataStructure(resource.content, useOpenApi3); // Attributes 1
        if (useOpenApi3) {
            if (scheme) {
                result[resource.name] = scheme
            }
        } else {
            result[resource.name] = scheme ? scheme : {};
        }
    }
    const model = resource.model;
    if (model.content && model.name) {
        scheme = searchDataStructure(model.content, useOpenApi3); // Attribute 2
        // fall back to body
        if (!scheme && model.content.length > 0) {
            scheme = generateSchemaFromExample(model.headers, model.content[0].content);
        }
        if (useOpenApi3) {
            if (scheme) {
                result[model.name + 'Model'] = scheme
            }
        } else {
            result[model.name + 'Model'] = scheme ? scheme : {};
        }
    }
    return result
};

var swaggerPaths = function (context, tag, resource) {
    const { useOpenApi3 } = context.options
    var paths = context.swagger.paths;
    var uriTemplate = UriTemplate.parse(resource.uriTemplate),
        pathName = swaggerPathName(uriTemplate);
    var pathParams = swaggerParameters(resource.parameters, uriTemplate, useOpenApi3); // for swagger ui
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

const processRequestSchema = (request, useOpenApi3) => {
    let schema
    // referencing Model's Schema is also here (no need to reference definitions)
    try {
        schema = JSON.parse(request.schema);
        delete schema['$schema'];
    } catch (e){
        // If we can't parse the request schema we have nothing left to do here. 
        return
    }
    try {
        // if we have example values in the body then insert them into the json schema
        if (!useOpenApi3) {
            var body = JSON.parse(request.body);

            if (schema['type'] === 'object') {
                schema.example = body;
            } else if (schema['type'] === 'array') {
                schema.items.example = body;
            }
        }
    // Catch any error from parsing the request body. However, if there is an error 
    // (ex. no request body given), we still want to keep the schema.
    } catch (e) {}
    return schema
}

const processRequestAttributes = (request, useOpenApi3, contentType, existingSchema) => {
    const schema = []
    scheme = searchDataStructure(request.content, useOpenApi3); // Attributes 4
    if (scheme) schema.push({ scheme, contentType });
    if (request.reference) {
        const componentsPath = useOpenApi3 ? '#/components/schemas' : '#/definitions/'
        schema.push({ 
            scheme: { 
                '$ref': componentsPath + escapeJSONPointer(request.reference.id + 'Model') 
            }, 
            contentType 
        });
    }
    // fall back to body
    if (request.body && existingSchema.length === 0 && schema.length === 0) {
        scheme = generateSchemaFromExample(request.headers, request.body, useOpenApi3);
        if (scheme) schema.push({ scheme, contentType });
    }
    return schema
}

var swaggerOperation = function (context, pathParams, uriTemplate, action, tag) {
    const { useOpenApi3 } = context.options
    var operation = {
        'responses': swaggerResponses(action.examples, context.options),
        'summary': action.name,
        'operationId': action.name,
        'description': action.description,
        'tags': tag ? [tag] : [],
        'parameters': pathParams.concat(swaggerParameters(action.parameters, uriTemplate, useOpenApi3))
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
        scheme = searchDataStructure(action.content, useOpenApi3); // Attributes 3
    if (scheme) schema.push({ contentType: 'application/json', scheme });

    const exampleBodies = {}

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
                    if (!operation.security.find(s => isEqual(s, security))){
                        operation.security.push(security);
                    }
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
         
            const contentTypeHeader = request.headers.find((h) => h.name === 'Content-Type')
            const contentType = contentTypeHeader ? contentTypeHeader.value : 'application/json'

            if (request.body) {
                try {
                    let body
                    if (typeof(request.body) === 'string') {
                        try {
                            body = JSON.parse(request.body);
                        } catch (e) {
                            if (contentType === 'text/plain') {
                                body = request.body
                            }
                        }
                    }

                    if (typeof(body) === 'object' || typeof(body) === 'array' || typeof(body) === 'string') {
                        if (!exampleBodies[contentType]) {
                            exampleBodies[contentType] = { example: body }
                        } else if (exampleBodies[contentType].examples) {
                            const count = Object.keys(exampleBodies[contentType].examples).length
                            const name = example + count
                            exampleBodies[contentType].examples[name].value = body
                        } else {
                            exampleBodies[contentType].examples = {
                                example1: { value: exampleBodies[contentType].example },
                                example2: { value: body }
                            }
                            delete exampleBodies[contentType].example
                        }
                    }
                } catch (e) {}
            }

            if (request.schema) { // Schema section in Request section
                scheme = processRequestSchema(request, useOpenApi3)
                if (scheme) schema.push({ scheme, contentType });
            } else {
                const attributes = processRequestAttributes(request, useOpenApi3, contentType, schema) 
                schema.push(...attributes)
            }
        }
    }
    if (useOpenApi3 && (schema.length || Object.keys(exampleBodies).length)){  
        operation.requestBody = { content: {} }
        if (Object.keys(exampleBodies).length) {
            operation.requestBody.content = exampleBodies
        }
    }
    // Make sure all content types exist to make setting the schemes easier.
    if (useOpenApi3) {
        schema.forEach(s => {
            if (!operation.requestBody.content[s.contentType]) {
                operation.requestBody.content[s.contentType] = {}
            }
        })
    }
    if (schema.length === 1) {
        if (useOpenApi3) {
            if (!operation.requestBody.content[schema[0].contentType]){
                operation.requestBody.content[schema[0].contentType] = schema[0].scheme 
            } else {
                operation.requestBody.content[schema[0].contentType].schema = schema[0].scheme 
            }
        } else {
            operation.parameters.push({ name: 'body', in: 'body', schema: schema[0].scheme });
        }
    } else if (schema.length > 1) {
        if (useOpenApi3){
            schema.forEach(s => {
                if (!operation.requestBody.content[s.contentType].schema){
                    operation.requestBody.content[s.contentType].schema = s.scheme
                } else {  
                    // If a schema exist for this content type, 
                    // we need to use oneOf because we have an additional schema to add.
                    const { oneOf } = operation.requestBody.content[s.contentType].schema
                    if (oneOf){
                        // If oneOf already exists we can just add the new schema if its not a duplicate.
                        if (!oneOf.find(sc => isEqual(sc, s.scheme))){
                            operation.requestBody.content[s.contentType].schema.oneOf.push(s.scheme)
                        }
                    } else {
                        // If oneOf does not exist and its not a duplicate, we need to create it, 
                        // making sure to include the existing schema.
                        if (!oneOf) {
                            const existing = operation.requestBody.content[s.contentType].schema
                            if (!isEqual(existing, s.scheme)){
                                operation.requestBody.content[s.contentType].schema = { 
                                    oneOf: [
                                        operation.requestBody.content[s.contentType].schema, // existing
                                        s.scheme // additional
                                    ]
                                }
                            }
                        }
                    }
                }
            })
        } else {
            operation.parameters.push({ name: 'body', in: 'body', schema: { 
                anyOf: schema.map((s) => s.scheme)
            } });
        }
    }
    return operation;
}

var swaggerHeaders = function (context, headers) {
    var params = [];
    const skipParams = ['content-type', 'authorization']; // handled in another way
    for (let i = 0; i < headers.length; i++) {
        const element = headers[i];
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
    headers.filter(function (header) {
        return header.name.toLowerCase() === 'authorization';
    }).forEach(function (header) {
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
                    authorizationUrl: '', tokenUrl: '', scopes: {}
                };
            }
        }
    });
    return security;
}

function swaggerParameters(parameters, uriTemplate, useOpenApi3) {
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

        if (parameter.example) {
            if (useOpenApi3) {
                param.example = parameter.example
            } else {
                param['x-example'] = parameter.example
            }
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
        } else {
            if (useOpenApi3) {
                param.schema = { type: paramType }
                if (parameterDefault) {
                    param.schema.default = parameterDefault;
                }
                if (allowedValues.length > 0) {
                    param.schema.enum = allowedValues;
                }
            } else {
                param.type = paramType;
                if (parameterDefault) {
                    param.default = parameterDefault;
                }
                if (allowedValues.length > 0) {
                    param.enum = allowedValues;
                }
            }
        }
        params.push(param);
    }
    return params;
}

var searchDataStructure = function (contents, useOpenApi3) {
    for (var i = 0; i < contents.length; i++) {
        var content = contents[i];
        if (content.element !== "dataStructure") continue;
        return jsonSchemaFromMSON(content, useOpenApi3);
    }
};

function generateSchemaFromExample(headers, example, useOpenApi3) {
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
        if (!useOpenApi3) {
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
    const { useOpenApi3 } = options;
    //console.log(examples);
    for (var l = 0; l < examples.length; l++) {
        var example = examples[l];
        //console.log(example);
        for (var m = 0; m < example.responses.length; m++) {
            var response = example.responses[m];
            //console.log(response);

            if (!responses[response.name]) {
                responses[response.name] = { description: {}, headers: {} }
            }
           
            responses[response.name].description = response.description || http.STATUS_CODES[response.name];
            if (useOpenApi3) {
                // Since openAPI3 allows multiple examples, we don't want to overwrite content every time.
                // This theme repeats itself throughout this module.
                if (!responses[response.name].content){
                    responses[response.name].content = {};
                }
            } else {
                responses[response.name].examples = {}
            }

            /* Prepare schema */
            let outputSchema = {}
            const componentsPath = useOpenApi3 ? '#/components/schemas' : '#/definitions/'
            if (options.preferReference) { // MSON then schema
                const inputSchema = searchDataStructure(response.content, useOpenApi3); // Attributes in response
                if (inputSchema) {
                    outputSchema.schema = inputSchema
                } else if (response.reference) {
                    outputSchema.schema = {
                        '$ref': componentsPath + escapeJSONPointer(response.reference.id + 'Model')
                    };
                } else if (response.schema) {
                    try {
                        outputSchema.schema = JSON.parse(response.schema);
                        delete outputSchema.schema['$schema'];
                        fixArraySchema(outputSchema.schema); // work around for Swagger UI / Editor
                    } catch (e) { }
                }
            } else { // schema then MSON
                if (response.schema) {
                    try {
                        outputSchema.schema = JSON.parse(response.schema);
                        delete outputSchema.schema['$schema'];
                        fixArraySchema(outputSchema.schema); // work around for Swagger UI / Editor
                    } catch (e) { }
                }
                if (!outputSchema.schema) {
                    const inputSchema = searchDataStructure(response.content, useOpenApi3); // Attributes in response
                    if (inputSchema) outputSchema.schema = inputSchema;
                }
                if (!outputSchema.schema && response.reference) {
                    outputSchema.schema = {
                        '$ref': componentsPath + escapeJSONPointer(response.reference.id + 'Model')
                    };
                }
            }

            /* set schema */
            if (outputSchema.schema){
                if (useOpenApi3) {
                    const contentTypeHeader = response.headers.find((h) => h.name.toLowerCase() === 'content-type') || 'application/json'
                    // In openAPI 3 the schema lives under the content type
                    if (contentTypeHeader && contentTypeHeader.value) {
                        if (!responses[response.name].content[contentTypeHeader.value]){
                            responses[response.name].content[contentTypeHeader.value] = {}
                        }
                        // If a schema already exists, we need to use oneOf for additional unique schemas.
                        if (responses[response.name].content[contentTypeHeader.value].schema) {
                            let existingSchema = { ...responses[response.name].content[contentTypeHeader.value].schema }
                            // It is possible that the given schema is a duplicate. If that's the case, we don't add it.
                            if (!isEqual(existingSchema, outputSchema.schema)){
                                if (existingSchema.oneOf){
                                    if (!existingSchema.oneOf.find((s) => isEqual(s, outputSchema.schema))){
                                        responses[response.name].content[contentTypeHeader.value].schema.oneOf.push(outputSchema.schema)
                                    }
                                } else {
                                    responses[response.name].content[contentTypeHeader.value].schema = { oneOf: [existingSchema, outputSchema.schema] }
                                }
                            }
                        } else {
                            responses[response.name].content[contentTypeHeader.value].schema = outputSchema.schema
                        }
                    }
                } else {
                    responses[response.name].schema = outputSchema.schema
                }
            }
            
            /* set examples */
            for (var n = 0; n < response.headers.length; n++) {
                var header = response.headers[n];
                if (header.name.toLowerCase() === 'content-type') {
                    let body
                    if (header.value.match(/application\/.*json/)) {
                        try {
                            body = JSON.parse(response.body);
                        } catch (e) { }
                    } else {
                        body = response.body
                    }
                    if (body || body === '') {
                        if (useOpenApi3) {
                            if (!responses[response.name].content[header.value]){
                                responses[response.name].content[header.value] = { examples: {} };
                            // If it already exists we don't want to override it.
                            } else if (!responses[response.name].content[header.value].examples){
                                responses[response.name].content[header.value].examples = {}
                            }
                            // Sample path to OpenAPI 3.0 example:  
                            // responses -> 200 -> content -> application/json -> examples -> example1 -> { }
                            if (body) {
                                const count = Object.keys(responses[response.name].content[header.value].examples).length + 1
                                const exampleName = 'example' + count
                                responses[response.name].content[header.value].examples[exampleName] = { value: body };
                            } else {
                                // If the body is an empty string, create a response path without an example.
                                responses[response.name].content[header.value] = {}
                            }
                        } else {
                            // Sample path to Swagger 2.0 example:  
                            // responses -> 200 -> examples -> application/json -> { }
                            responses[response.name].examples[header.value] = body;
                        }
                    }
                } else if (header.name.toLowerCase() !== 'authorization') {
                    responses[response.name].headers[header.name] = { 'type': 'string' }
                }
            }
        }
    }
    return responses;
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
        //for (var i = 0; i < result.warnings.length; i++) {
        //    var warn = result.warnings[i];
        //    console.log(warn);
        //}
        var swagger = apib2swagger(result.ast, options);
        return callback(null, { swagger: swagger });
    }
    catch (error) {
        return callback(error, {});
    }
};
