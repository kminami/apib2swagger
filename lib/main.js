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
    for (var i = 0; i < apib.resourceGroups.length; i++) {
        // description in Resource group section is discarded
        var group = apib.resourceGroups[i];
        //console.log("- " + group.name);
        for (var j = 0; j < group.resources.length; j++) {
            // (name, description) in Resource section are discarded
            var resource = group.resources[j];
            //console.log("-- " + resource.name + " " + resource.uriTemplate);
            var uriTemplate = UriTemplate.parse(resource.uriTemplate);
            var pathName = swaggerPathName(uriTemplate);
            swagger.paths[pathName] = swaggerPath(resource.parameters, resource.actions, group.name, uriTemplate);
        }
    }
    return swagger;
}

function swaggerPathName(uriTemplate) {
    var params = {}
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

function swaggerPath(topParameters, actions, tag, uriTemplate) {
    path = {}
    var parameters = swaggerParameters(topParameters, uriTemplate);
    console.log('actions', actions);
    for (var k = 0; k < actions.length; k++) {
        var action = actions[k];
        //console.log("--- " + action.method);
        var operation = {
            'responses': swaggerResponses(action.examples),
            'summary': action.name,
            'description': action.description,
            'tags': [tag],
            'parameters': parameters.concat(swaggerParameters(action.parameters, uriTemplate)),
        }
        //operation.produces = [];
        //for (var key in operation.responses) {
        //    var response = operation.responses[key];
        //    for (var mime in response.examples) {
        //        operation.produces.push(mime);
        //    }
        //}
        path[action.method.toLowerCase()] = operation;
    }
    return path;
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
        if (parameter.values.length > 0) {
            param.enum = parameter.values;
        }
        params.push(param);
    }
    return params;
}

function getParamType(name, uriTemplate) {
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
    return 'header' // TODO: decide 'header', 'formData', 'body'
}

function swaggerResponses(examples) {
    var responses = {};
    //console.log(examples);
    for (var l = 0; l < examples.length; l++) {
        var example = examples[l];
        //console.log(example);
        //for (var m = 0; m < example.requests.length; m++) {
        //    console.log(example.requests[m]);
        //}
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

