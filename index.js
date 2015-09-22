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
                var groupName = category.attributes ? category.attributes.name : '(no tags)';
                swaggerDefinitions(swagger.definitions, content);
                swaggerPaths(swagger.paths, groupName, content);
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

var swaggerPaths = function (paths, tag, resource) {
    var uriTemplate = UriTemplate.parse(resource.uriTemplate),
        pathName = swaggerPathName(uriTemplate);
    //path.parameters = swaggerParameters(resource.parameters, uriTemplate);
    var pathParams = swaggerParameters(resource.parameters, uriTemplate); // for swagger ui
    for (var k = 0; k < resource.actions.length; k++) {
        var action = resource.actions[k];
        if (!action.attributes.uriTemplate) {
            if (!paths[pathName]) paths[pathName] = {};
            paths[pathName][action.method.toLowerCase()] = swaggerOperation(pathParams, uriTemplate, action, tag);
            continue;
        }
        var attrUriTemplate = UriTemplate.parse(action.attributes.uriTemplate),
            attrPathName = swaggerPathName(attrUriTemplate);
        if (!paths[attrPathName]) paths[attrPathName] = {};
        paths[attrPathName][action.method.toLowerCase()] = swaggerOperation([], attrUriTemplate, action, tag);
    }
};

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
    if (schema.length == 1) {
        operation.parameters.push({name: 'body', in: 'body', schema: schema[0]});
    } else if (schema.length > 1) {
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
            'required': parameter.required
        }
        if (PARAM_TYPES.hasOwnProperty(parameter.type)) {
            param.type = PARAM_TYPES[parameter.type];
        } else {
            param.type = 'string';
        }
        if (parameter.default) {
            if (param.type === 'number' || param.type === 'integer') {
                param.default = Number(parameter.default);
            } else {
                param.default = parameter.default;
            }
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
    // MEMO: content.typeDefinition.typeSpecification.name referrences DataStructure name
    var type = content.typeDefinition.typeSpecification;
    if (type.name === 'string') {
        return {type: 'string'};
    }
    if (type.name === 'number') {
        return {type: 'number'};
    }
    if (type.name === 'array') {
        if (!type.nestedTypes || type.nestedTypes.length === 0) {
            return {type: 'array'};
        } else if (type.nestedTypes.length === 1) {
            return {type: 'array', items: {'$ref': '#/definitions/' + type.nestedTypes[0].literal}};
        } else if (type.nestedTypes.length > 1) {
            var items = [];
            for (var i = 0; i < type.nestedTypes.length; i++) {
                items.push({'$ref': '#/definitions/' + type.nestedTypes[i].literal});
            }
            return {type: 'array', items: {'allOf': items}};
        }
    }
    if (type.name !== 'object' && type.name !== null) { // except object
        if (type.name.literal) { // referrence
            return {'$ref': '#/definitions/' + type.name.literal};
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

