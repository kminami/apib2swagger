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

// Return a reference object to the file path from the include statement.
const getRefFromInclude = (include) => {
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

const hasFileRef = (section) => section
    .replace(/\s+/g, '') // remove spaces
    .includes('<!--include')

const processRequestSchema = (request, useOpenApi3) => {
    let schema
    if (useOpenApi3 && hasFileRef(request.schema)) {
        return getRefFromInclude(request.schema)
    }

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

const processRequestAttributes = (request, useOpenApi3, contentType) => {
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
    return schema
}

const mergeHeaders = (headers, parameters, useOpenApi3) => {
    const existingHeaders = parameters
        .filter(param => param.in === 'header')
        .map(param => param.name.toLowerCase());
    
    let nonDuplicateHeaders
    if (useOpenApi3) {
        // We are comparing the whole object instead of just the name to allow duplicate names.
        // In doing so, we allow multiple types of Authorization headers to be specified.
        nonDuplicateHeaders = headers.filter(header => 
            !parameters.find(p => isEqual(p, header))
        )
    } else {
        nonDuplicateHeaders = headers.filter(header => 
            !existingHeaders.includes(header.name.toLowerCase())
        );
    }
    return parameters.concat(nonDuplicateHeaders);
}

const buildBodyExamples = (requestBody, bodyExamples, contentType) => {
    let body
    if (typeof requestBody === 'string') {
        if (hasFileRef(requestBody)){
            body = getRefFromInclude(requestBody)
        } else {
            try {
                body = JSON.parse(requestBody);
            } catch (e) {
                if (contentType === 'text/plain') {
                    body = requestBody 
                }
            }
        }
    }

    if (typeof body !== 'object' && typeof body !== 'array' && typeof body !== 'string') {
        return bodyExamples
    }

    if (!bodyExamples[contentType]) {
        bodyExamples[contentType] = { example: body }
    } else if (bodyExamples[contentType].examples) {
        const count = Object.keys(bodyExamples[contentType].examples).length
        const name = example + count
        bodyExamples[contentType].examples[name].value = body
    } else {
        bodyExamples[contentType].examples = {
            example1: { value: bodyExamples[contentType].example },
            example2: { value: body }
        }
        delete bodyExamples[contentType].example
    }
    return bodyExamples
}

const getOpenApiRequestSchema = (request, schema, contentType, preferReference) => {
    /* 
        With OpenAPI3 we can make full use of Attributes because examples no longer live
        on the schema object and therefore, we don't lose our examples when we use 
        Attributes as the schema definition.
    */
    const contentTypeScheme = {}
    if (!preferReference) {
        if (request.schema) { // Schema section in Request section
            contentTypeScheme[contentType] = processRequestSchema(request, true)
        } 
        if (contentTypeScheme[contentType]) {
            schema.push({ scheme: contentTypeScheme[contentType], contentType });
        } else {
            const attributes = processRequestAttributes(request, true, contentType, schema) 
            schema.push(...attributes)
        }
    } else {
        const attributes = processRequestAttributes(request, true, contentType, schema) 
        if (attributes.length) {
            schema.push(...attributes)
        } else {
            contentTypeScheme[contentType] = processRequestSchema(request, true)
            if (contentTypeScheme[contentType]) {
                schema.push({ scheme: contentTypeScheme[contentType], contentType });
            }
        }
    }
    // If there are no schema but we have a body example, try to generate a schema from it.
    // We stop at 1 auto-generated schema.
    if (request.body && schema.length === 0) {
        contentTypeScheme[contentType] = generateSchemaFromExample(request.headers, request.body, true);
        if (contentTypeScheme[contentType]){
            schema.push({ scheme: contentTypeScheme[contentType], contentType });
        }
    }
    return schema
}

var swaggerOperation = function (context, pathParams, uriTemplate, action, tag) {
    const { useOpenApi3, preferReference } = context.options
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

    let bodyExamples = {}

    for (var j = 0; j < action.examples.length; j++) {
        var example = action.examples[j];
        for (var l = 0; l < example.requests.length; l++) {
            var request = example.requests[l];

            if (!useOpenApi3) {
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
            }

            var headers = swaggerHeaders(context, request.headers);
            if (headers) {
                operation.parameters = mergeHeaders(headers, operation.parameters, useOpenApi3)
            }
         
            const contentTypeHeader = request.headers.find((h) => h.name === 'Content-Type')
            const contentType = contentTypeHeader ? contentTypeHeader.value : 'application/json'

            if (request.body && useOpenApi3) {
                bodyExamples = buildBodyExamples(request.body, bodyExamples, contentType)
            }

            if (!useOpenApi3) {
                // Build schemas and examples for swagger 2.0
                if (request.schema) {
                    scheme = processRequestSchema(request, useOpenApi3)
                    if (scheme) schema.push({ scheme, contentType });
                } else {
                    const attributes = processRequestAttributes(request, useOpenApi3, contentType, schema) 
                    schema.push(...attributes)
                    // fall back to body
                    if (request.body && schema.length === 0) {
                        scheme = generateSchemaFromExample(request.headers, request.body, useOpenApi3);
                        if (scheme) schema.push({ scheme, contentType });
                    }
                }
            } else {
                schema = getOpenApiRequestSchema(request, schema, contentType, preferReference)
            }
        }
    }
    if (useOpenApi3 && (schema.length || Object.keys(bodyExamples).length)){  
        operation.requestBody = { content: {} }
        if (Object.keys(bodyExamples).length) {
            operation.requestBody.content = bodyExamples
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
    const skipParams = context.options.useOpenApi3 ? ['content-type'] : ['content-type', 'authorization']; // handled in another way
    for (let i = 0; i < headers.length; i++) {
        const element = headers[i];
        if (skipParams.includes(element.name.toLowerCase())) continue;
        var param = {
            'name': element.name,
            'in': 'header',
            'description': `e.g. ${element.value}`,
            'required': false
        };
        if (context.options.useOpenApi3) {
            param.schema = { type: 'string' }
            param.example = element.value
        } else {
            param['x-example'] = element.value
            param.type = 'string' // TODO: string, number, boolean, integer, array
        }
        if (!params.find(p => isEqual(p, param)))
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

const parseResponseSchema = (schema, useOpenApi3) => {
    if (!schema) return
    if (useOpenApi3 && hasFileRef(schema)){
        return getRefFromInclude(schema) 
    }
    try {
        const result = JSON.parse(schema);
        delete result['$schema'];
        fixArraySchema(result); // work around for Swagger UI / Editor
        return result
    } catch (e) { }
}

const parseResponseBody = (body, header, useOpenApi3) => {
    if (useOpenApi3 && hasFileRef(body)){
        return getRefFromInclude(body)
    }
    if (!header.value.match(/application\/.*json/)) {
        return body
    } 
    try {
        return JSON.parse(body);
    } catch (e) { }
}

const getResponseSchema = (response, options) => {
    const { preferReference, useOpenApi3 } = options
    const componentsPath = useOpenApi3 ? '#/components/schemas' : '#/definitions/'
    if (preferReference) { // MSON then schema
        const inputSchema = searchDataStructure(response.content, useOpenApi3); // Attributes in response
        if (inputSchema) {
            return inputSchema
        } else if (response.reference) {
            return {
                '$ref': componentsPath + escapeJSONPointer(response.reference.id + 'Model')
            };
        } else if (response.schema) {
            return parseResponseSchema(response.schema, useOpenApi3)
        }
    } else { // schema then MSON
        if (response.schema) {
            return parseResponseSchema(response.schema, useOpenApi3)
        }
       
        const inputSchema = searchDataStructure(response.content, useOpenApi3); // Attributes in response
        if (inputSchema) return inputSchema;
        if (response.reference) {
            return {
                '$ref': componentsPath + escapeJSONPointer(response.reference.id + 'Model')
            };
        }
    }
}

const setResponseSchema = (responses, response, schema, useOpenApi3) => {
    if (!useOpenApi3){
        responses[response.name].schema = schema
        return responses
    }
    // In openAPI 3 the schema lives under the content type
    const contentTypeHeader = response.headers.find((h) => h.name.toLowerCase() === 'content-type')
    if (!contentTypeHeader.value) {
        return responses
    }
    if (!responses[response.name].content[contentTypeHeader.value]){
        responses[response.name].content[contentTypeHeader.value] = {}
    }
    
    if (!responses[response.name].content[contentTypeHeader.value].schema){
        responses[response.name].content[contentTypeHeader.value].schema = schema
        return responses
    }

    // If a schema already exists, we need to use oneOf for additional unique schemas.
    let existingSchema = { ...responses[response.name].content[contentTypeHeader.value].schema }
    // It is possible that the given schema is a duplicate. If that's the case, we don't add it.
    if (isEqual(existingSchema, schema)){
        return responses
    }

    if (existingSchema.oneOf){
        if (!existingSchema.oneOf.find((s) => isEqual(s, schema))){
            responses[response.name].content[contentTypeHeader.value].schema.oneOf.push(schema)
        }
    } else {
        responses[response.name].content[contentTypeHeader.value].schema = { oneOf: [existingSchema, schema] }
    }
    return responses
}

const setResponseExample = (responses, response, header, body, useOpenApi3) => {
    if (!useOpenApi3) {
        // Sample path to Swagger 2.0 example:  
        // responses -> 200 -> examples -> application/json -> { }
        responses[response.name].examples[header.value] = body;
        return responses
    }

    if (!responses[response.name].content[header.value]){
        responses[response.name].content[header.value] = { examples: {} };
    } else if (!responses[response.name].content[header.value].examples){
        // If it already exists we don't want to override it.
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
    return responses
}

function swaggerResponses(examples, options) {
    var responses = {};
    const { useOpenApi3 } = options;
    for (var l = 0; l < examples.length; l++) {
        var example = examples[l];
        for (var m = 0; m < example.responses.length; m++) {
            var response = example.responses[m];

            if (!responses[response.name]) {
                responses[response.name] = { description: {}, headers: {} }
            }
           
            responses[response.name].description = response.description || http.STATUS_CODES[response.name];
            if (useOpenApi3) {
                // Does not overwrite and allows multiple examples.
                if (!responses[response.name].content){
                    responses[response.name].content = {};
                }
            } else {
                // Overwrites every time
                responses[response.name].examples = {}
            }

            const schema = getResponseSchema(response, options)

            if (schema){
                responses = setResponseSchema(responses, response, schema, useOpenApi3)
            }
            
            for (var n = 0; n < response.headers.length; n++) {
                var header = response.headers[n];
                if (header.name.toLowerCase() === 'content-type') {
                    let body = parseResponseBody(response.body, header, useOpenApi3)
                    if (body || body === '') {
                        responses = setResponseExample(responses, response, header, body, useOpenApi3) 
                    }
                } else if (header.name.toLowerCase() !== 'authorization') {
                    if (useOpenApi3) {
                        responses[response.name].headers[header.name] = { 
                            schema: { 'type': 'string' }
                        }
                    } else {
                        responses[response.name].headers[header.name] = { 'type': 'string' }
                    }
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
