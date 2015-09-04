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
            var resourceParams = swaggerParameters(resource.parameters, uriTemplate);
            resourceParams = resourceParams.concat(swaggerParametersFromContent(resource.content, uriTemplate)); // Attributes
            swagger.paths[pathName] = swaggerPath(resourceParams, resource.actions, group.name, uriTemplate);
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

function swaggerPath(resourceParams, actions, tag, uriTemplate) {
    var path = {};
    for (var k = 0; k < actions.length; k++) {
        var action = actions[k],
            params = resourceParams.concat(swaggerParameters(action.parameters, uriTemplate));
        params = params.concat(swaggerParametersFromContent(action.content));
        for (var j = 0; j < action.examples.length; j++) {
            var example = action.examples[j];
            for (var l = 0; l < example.requests.length; l++) {
                var request = example.requests[l];
                params = params.concat(swaggerParametersFromContent(request.content));
            }
        }
        var operation = {
            'responses': swaggerResponses(action.examples),
            'summary': action.name,
            'description': action.description,
            'tags': [tag],
            'parameters': params
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
        for (var j = 0; j < parameter.values.length; j++) {
            if (!param.enum) param.enum = [];
            param.enum.push(parameter.values[j].value);
        }
        params.push(param);
    }
    return params;
}

var swaggerParametersFromContent = function (contents, uriTemplate) {
    var params = [];
    for (var i = 0; i < contents.length; i++) {
        var content = contents[i];
        if (content.element !== "dataStructure") continue;
        // MEMO: content.typeDefinition.typeSpecification.name is referrenced DataStructure name
        for (var j = 0; j < content.sections.length; j++) {
            var section = content.sections[j];
            if (section.class !== "memberType") continue;
            for (var k = 0; k < section.content.length; k++) {
                if (section.content[k].class !== "property") continue;
                var property = section.content[k].content;
                var param = {
                    name: property.name.literal,
                    in: getParamType(property.name.literal, uriTemplate),
                    description: property.description,
                    //required: ,
                    //default: ,
                    type: property.valueDefinition.typeDefinition.typeSpecification.name,
                };
                // MEMO: property.valueDefinition.values are example.
                params.push(param);
            }
        }
    }
    return params;
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

