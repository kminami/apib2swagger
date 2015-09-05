var url = require('url'),
    http = require('http'),
    protagonist = require('protagonist'),
    UriTemplate = require('uritemplate');

var apib2swagger = module.exports.convertParsed = function(apib) {
    //console.log(JSON.stringify(apib, null, 4));
    var swagger = {};
    swagger.swagger = '2.0';
    swagger.info = {
        'title': apib.name,
        'version': '',
        'description': apib.description
    }
    for (var i = 0; i < apib.metadata.length; i++) {
        var meta = apib.metadata[i];
        //console.log(meta);
        if (meta.name.toLowerCase() === 'host') {
            var urlParts = url.parse(meta.value);
            swagger.host = urlParts.host;
            swagger.basePath = urlParts.pathname;
            swagger.schemes = [urlParts.protocol.replace(':','')];
        }
    }
    swagger.paths = {};
    swagger.definitions = {};
    for (var i = 0; i < apib.content.length; i++) {
        // description in Resource group section is discarded
        var category = apib.content[i];
        if (category.element !== 'category') continue;
        for (var j = 0; j < category.content.length; j++) {
            var content = category.content[j];
            if (content.element === 'resource') {
                // (name, description) in Resource section are discarded
                var uriTemplate = UriTemplate.parse(content.uriTemplate),
                    pathName = swaggerPathName(uriTemplate),
                    groupName = category.attributes ? category.attributes.name : '(no tags)';
                swagger.paths[pathName] = swaggerPath(content, groupName, uriTemplate);
                continue;
            }
            if (content.element === 'copy') {
                continue;
            }
            if (content.element === 'dataStructure') {
                swagger.definitions[content.name.literal] = jsonSchemaFromMSON(content);
                continue;
            }
        }
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

function swaggerPath(resource, tag, uriTemplate) {
    var definitions = {}, // TODO: global json schema
        scheme = searchDataStructure(resource.content); // Attributes 1
    if (resource.name && scheme) {
        definitions[resource.name] = scheme;
    }
    if (resource.model.content) {
        scheme = searchDataStructure(resource.model.content); // Attribute 2
        if (resource.model.name && scheme) {
            definitions[resource.model.name + 'Model'] = scheme;
        }
    }
    var path = {};
    //path.parameters = swaggerParameters(resource.parameters, uriTemplate);
    var pathParams = swaggerParameters(resource.parameters, uriTemplate); // for swagger ui
    for (var k = 0; k < resource.actions.length; k++) {
        var action = resource.actions[k];
        path[action.method.toLowerCase()] = swaggerOperation(pathParams, uriTemplate, action, tag);
    }
    return path;
}

var swaggerOperation = function (pathParams, uriTemplate, action, tag) {
    var operation = {
        'responses': swaggerResponses(action.examples),
        'summary': action.name,
        'description': action.description,
        'tags': [tag],
        'parameters': pathParams.concat(swaggerParameters(action.parameters, uriTemplate))
    }
    //operation.produces = [];
    //for (var key in operation.responses) {
    //    var response = operation.responses[key];
    //    for (var mime in response.examples) {
    //        operation.produces.push(mime);
    //    }
    //}
    // body parameter (schema)
    var schema = [],
        scheme = searchDataStructure(action.content); // Attributes 3
    if (scheme) schema.push(scheme);
    for (var j = 0; j < action.examples.length; j++) {
        var example = action.examples[j];
        for (var l = 0; l < example.requests.length; l++) {
            var request = example.requests[l];
            scheme = searchDataStructure(request.content); // Attributes 4
            if (scheme) schema.push(scheme);
            if (request.reference) {
                schema.push({'$ref': '#/definitions/' + request.reference.id + 'Model'});
            }
        }
        //for (var l = 0; l < example.responses.length; l++) {
        //    var response = example.responses[l];
        //    scheme = searchDataStructure(response.content));
        //    if (scheme) schema.push(scheme);
        //}
    }
    if (schema.length > 0) {
        operation.parameters.push({name: 'body', in: 'body', schema: {allOf: schema}});
    }
    return operation;
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
            'required': parameter.required,
            'default': parameter.default,
        }
        if (PARAM_TYPES.hasOwnProperty(parameter.type)) {
            param.type = PARAM_TYPES[parameter.type];
        } else {
            param.type = 'string';
        }
        for (var j = 0; j < parameter.values.length; j++) {
            if (!param.enum) param.enum = [];
            param.enum.push(parameter.values[j].value);
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

var jsonSchemaFromMSON = function (content) {
    // MEMO: content.typeDefinition.typeSpecification.name is referrenced DataStructure name
    var type = content.typeDefinition.typeSpecification.name;
    if (type === 'string') {
        return {type: 'string'};
    }
    if (type !== 'object' && type !== null) { // except object
        if (type.literal) { // referrence
            return {'$ref': '#/definitions/' + type.literal};
        }
        return {type: ''}; // except referrence
    }
    if (!content.sections) {
        return {type: 'string'}; // TODO
    }
    // object
    var schema = {};
    schema.type = 'object';
    schema.required = [];
    schema.properties = {};
    for (var j = 0; j < content.sections.length; j++) {
        var section = content.sections[j];
        if (section.class !== "memberType") continue;
        for (var k = 0; k < section.content.length; k++) {
            if (section.content[k].class !== "property") continue;
            var property = section.content[k].content;
            schema.properties[property.name.literal] = jsonSchemaFromMSON(property.valueDefinition);
            //var param = {
            //    name: property.name.literal,
            //    in: getParamType(property.name.literal),
            //    description: property.description,
            //    //required: ,
            //    //default: ,
            //    type: property.valueDefinition.typeDefinition.typeSpecification.name,
            //};
            //// MEMO: property.valueDefinition.values are example.
            //params.push(param);
        }
    }
    return schema;
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

function swaggerResponses(examples) {
    var responses = {};
    //console.log(examples);
    for (var l = 0; l < examples.length; l++) {
        var example = examples[l];
        //console.log(example);
        for (var m = 0; m < example.responses.length; m++) {
            var response = example.responses[m];
            //console.log(response);
            responses[response.name] = {
                "description": http.STATUS_CODES[response.name],
                "headers": {},
                "examples": {}
            };
            //for (var n = 0; n < response.headers.length; n++) {
            //    var header = response.headers[n];
            //    responses[response.name].headers[header.name] = {'type':'string'}
            //    if (header.name === 'Content-Type') {
            //        responses[response.name].examples[header.value] = response.body;
            //    }
            //}
        }
    }
    return responses;
}

exports.convert = function (data, callback) {
    protagonist.parse(data, function (error, result) {
        if (error) {
            return callback(error, {});
        }
        //for (var i = 0; i < result.warnings.length; i++) {
        //    var warn = result.warnings[i];
        //    console.log(warn);
        //}
        var swagger = apib2swagger(result.ast);
        return callback(null, {swagger: swagger});
    });
};
