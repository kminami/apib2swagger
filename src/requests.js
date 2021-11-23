const { hasFileRef, getRefFromInclude, searchDataStructure, generateSchemaFromExample } = require('./util')
const isEqual = require('lodash.isequal')
const escapeJSONPointer = require('./escape_json_pointer')

const swaggerHeaders = function (context, headers) {
    var params = [];
    const skipParams = context.options.openApi3 ? ['content-type'] : ['content-type', 'authorization']; // handled in another way
    for (let i = 0; i < headers.length; i++) {
        const element = headers[i];
        if (skipParams.includes(element.name.toLowerCase())) continue;
        var param = {
            'name': element.name,
            'in': 'header',
            'description': `e.g. ${element.value}`,
            'required': false
        };
        if (context.options.openApi3) {
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

const setSecurity = (context, request, operation) => {
    if (context.options.openApi3){
        return operation
    }
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
    return operation
}

const setSwaggerRequestSchema = (operation, schema) => {
    if (!schema.length) {
        return operation
    }
    if (schema.length === 1) {
        operation.parameters.push({ name: 'body', in: 'body', schema: schema[0].scheme })
        return operation
    } 
    operation.parameters.push({ 
        name: 'body', 
        in: 'body', 
        schema: { 
            anyOf: schema.map((s) => s.scheme)
        } 
    });
    return operation
}

const mergeHeaders = (headers, parameters, openApi3) => {
    const existingHeaders = parameters
        .filter(param => param.in === 'header')
        .map(param => param.name.toLowerCase());
    
    let nonDuplicateHeaders
    if (openApi3) {
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

const processRequestSchema = (request, openApi3) => {
    let schema
    if (openApi3 && hasFileRef(request.schema)) {
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
        if (!openApi3) {
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

const processRequestAttributes = (request, openApi3, contentType) => {
    const schema = []
    scheme = searchDataStructure(request.content, openApi3); // Attributes 4
    if (scheme) schema.push({ scheme, contentType });
    if (request.reference) {
        const componentsPath = openApi3 ? '#/components/schemas' : '#/definitions/'
        schema.push({ 
            scheme: { 
                '$ref': componentsPath + escapeJSONPointer(request.reference.id + 'Model') 
            }, 
            contentType 
        });
    }
    return schema
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
        bodyExamples[contentType].examples[name] = body.$ref ? body : { value: body }
    } else {
        const existingExample = bodyExamples[contentType].example
        bodyExamples[contentType].examples = {
            example1: existingExample.$ref ? existingExample : { value: existingExample },
            example2: body.$ref ? body : { value: body }
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

const setOpenApiRequestSchema = (operation, schema) => {
    if (!schema.length){
        return operation
    }

    // Make sure all content types exist to make setting the schemes easier.
    schema.forEach(s => {
        if (!operation.requestBody.content[s.contentType]) {
            operation.requestBody.content[s.contentType] = {}
        }
    })

    if (schema.length === 1) {
        if (!operation.requestBody.content[schema[0].contentType]){
            operation.requestBody.content[schema[0].contentType] = schema[0].scheme 
        } else {
            operation.requestBody.content[schema[0].contentType].schema = schema[0].scheme 
        }
        return operation
    } 

    schema.forEach(s => {
        if (!operation.requestBody.content[s.contentType].schema){
            operation.requestBody.content[s.contentType].schema = s.scheme
            return
        }   
        // If a schema exist for this content type, 
        // we need to use oneOf because we have an additional schema to add.
        const { oneOf } = operation.requestBody.content[s.contentType].schema
        if (oneOf){
            // If oneOf already exists we can just add the new schema if its not a duplicate.
            if (!oneOf.find(sc => isEqual(sc, s.scheme))){
                operation.requestBody.content[s.contentType].schema.oneOf.push(s.scheme)
            }
            return
        }
        const existing = operation.requestBody.content[s.contentType].schema
        if (isEqual(existing, s.scheme)){
            return
        }
        // If oneOf does not exist and its not a duplicate, we need to create it, 
        // making sure to include the existing schema.
        operation.requestBody.content[s.contentType].schema = { 
            oneOf: [
                operation.requestBody.content[s.contentType].schema, // existing
                s.scheme // additional
            ]
        }
    })
    return operation
}

module.exports.processRequests = (operation, action, context) => {
    const { openApi3, preferReference } = context.options
    var schema = [],
        scheme = searchDataStructure(action.content, openApi3); // Attributes 3
    if (scheme) schema.push({ contentType: 'application/json', scheme });

    let bodyExamples = {}

    for (var j = 0; j < action.examples.length; j++) {
        var example = action.examples[j];
        for (var l = 0; l < example.requests.length; l++) {
            var request = example.requests[l];
            
            operation = setSecurity(context, request, operation)

            var headers = swaggerHeaders(context, request.headers);
            if (headers) {
                operation.parameters = mergeHeaders(headers, operation.parameters, openApi3)
            }
         
            const contentTypeHeader = request.headers.find((h) => h.name === 'Content-Type')
            const contentType = contentTypeHeader ? contentTypeHeader.value : 'application/json'

            if (request.body && openApi3) {
                bodyExamples = buildBodyExamples(request.body, bodyExamples, contentType)
            }

            if (!openApi3) {
                // Build schemas and examples for swagger 2.0
                if (request.schema) {
                    scheme = processRequestSchema(request, openApi3)
                    if (scheme) schema.push({ scheme, contentType });
                } else {
                    const attributes = processRequestAttributes(request, openApi3, contentType, schema) 
                    schema.push(...attributes)
                    // fall back to body
                    if (request.body && schema.length === 0) {
                        scheme = generateSchemaFromExample(request.headers, request.body, openApi3);
                        if (scheme) schema.push({ scheme, contentType });
                    }
                }
            } else {
                schema = getOpenApiRequestSchema(request, schema, contentType, preferReference)
            }
        }
    }
    if (openApi3 && (schema.length || Object.keys(bodyExamples).length)){  
        operation.requestBody = { content: {} }
        if (Object.keys(bodyExamples).length) {
            operation.requestBody.content = bodyExamples
        }
    }
  
    return openApi3 ? setOpenApiRequestSchema(operation, schema) : setSwaggerRequestSchema(operation, schema)
}