const { fixArraySchema, hasFileRef, getRefFromInclude, searchDataStructure } = require('./util')
const escapeJSONPointer = require('./escape_json_pointer')
const isEqual = require('lodash.isequal')
const http = require('http')
const toOpenApi = require('json-schema-to-openapi-schema')

const parseResponseSchema = (schema, options) => {
    if (!schema) return
    if (options.openApi3 && hasFileRef(schema)){
        return getRefFromInclude(schema) 
    }
    try {
        const result = JSON.parse(schema);
        delete result['$schema'];
        fixArraySchema(result); // work around for Swagger UI / Editor
        return result
    } catch (e) { }
}

const parseResponseBody = (body, header, options) => {
    if (options.openApi3 && hasFileRef(body)){
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
    const componentsPath = options.openApi3 ? '#/components/schemas' : '#/definitions/'
    if (options.preferReference) { // MSON then schema
        const inputSchema = searchDataStructure(response.content, options); // Attributes in response
        if (inputSchema) {
            return inputSchema
        } else if (response.reference) {
            return {
                '$ref': componentsPath + escapeJSONPointer(response.reference.id + 'Model')
            };
        } else if (response.schema) {
            return parseResponseSchema(response.schema, options)
        }
    } else { // schema then MSON
        if (response.schema) {
            const schema = parseResponseSchema(response.schema, options)
            if (schema) {
                return schema
            }
        }
       
        const inputSchema = searchDataStructure(response.content, options); // Attributes in response
        if (inputSchema) return inputSchema;
        if (response.reference) {
            return {
                '$ref': componentsPath + escapeJSONPointer(response.reference.id + 'Model')
            };
        }
    }
}

const setResponseSchema = (responses, response, schema, options) => {
    if (!options.openApi3){
        responses[response.name].schema = schema
        return responses
    }
    // Convert JSON Schema draft04 to OpenAPI 3.0.x (type: null -> nullable: true)
    // TODO: Skip this for OpenAPI 3.1.x or later.
    schema = toOpenApi(schema)

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

const setResponseExample = (responses, response, header, body, options) => {
    if (!options.openApi3) {
        // Sample path to Swagger 2.0 example:  
        // responses -> 200 -> examples -> application/json -> { }
        responses[response.name].examples[header.value] = body;
        return responses
    }
    if (!body) {
        return responses
    }

    // Sample path to OpenAPI 3.0 examples:  
    // responses -> 200 -> content -> application/json -> example -> { }
    // responses -> 200 -> content -> application/json -> examples -> example1 -> { }
    const existingContainer = responses[response.name].content[header.value]
    if (!existingContainer){
        responses[response.name].content[header.value] = { example: body };
    } else if (existingContainer.examples) {
        const count = Object.keys(existingContainer.examples).length + 1
        const exampleName = 'example' + count
        responses[response.name].content[header.value].examples[exampleName] = body.$ref ? body : { value: body };
    } else if (existingContainer.example) {
        const existingExample = existingContainer.example
        responses[response.name].content[header.value].examples = {
            example1: existingExample.$ref ? existingExample : { value: existingExample },
            example2: body.$ref ? body : { value: body }
        }
        delete responses[response.name].content[header.value].example
    } else if (!existingContainer.example) {
        responses[response.name].content[header.value].example = body
    }
    return responses
}

module.exports.processResponses = (examples, options) => {
    let responses = {};
    const { openApi3 } = options;
    for (var l = 0; l < examples.length; l++) {
        var example = examples[l];
        for (var m = 0; m < example.responses.length; m++) {
            var response = example.responses[m];

            if (!responses[response.name]) {
                responses[response.name] = { description: {}, headers: {} }
            }
           
            responses[response.name].description = response.description || http.STATUS_CODES[response.name];
            if (openApi3) {
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
                responses = setResponseSchema(responses, response, schema, options)
            }
            
            for (var n = 0; n < response.headers.length; n++) {
                var header = response.headers[n];
                if (header.name.toLowerCase() === 'content-type') {
                    let body = parseResponseBody(response.body, header, options)
                    if (body || body === '') {
                        responses = setResponseExample(responses, response, header, body, options) 
                    }
                } else if (header.name.toLowerCase() !== 'authorization') {
                    if (openApi3) {
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