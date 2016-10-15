var url = require('url'),
    http = require('http'),
    drafter = require('drafter.js'),
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
    apib.metadata.forEach(function(meta) {
        //console.log(meta);
        if (meta.name.toLowerCase() === 'host') {
            var urlParts = url.parse(meta.value);
            swagger.host = urlParts.host;
            swagger.basePath = urlParts.pathname;
            swagger.schemes = [urlParts.protocol.replace(':','')];
        }
    });
    swagger.paths = {};
    swagger.definitions = {};
    apib.content.filter(function(content) {
        return content.element === 'category';
    }).forEach(function(category) {
        // description in Resource group section is discarded
        var groupName = category.attributes ? category.attributes.name : '';
        category.content.forEach(function(content) {
            if (content.element === 'resource') {
                // (name, description) in Resource section are discarded
                swaggerDefinitions(swagger.definitions, content);
                swaggerPaths(swagger.paths, groupName, content);
            } else if (content.element === 'copy') {
            } else if (content.element === 'dataStructure') {
                swagger.definitions[content.content[0].meta.id] = jsonSchemaFromMSON(content);
            }
        });
    });
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
            if (request.schema) { // Schema section in Request section
                try {
                    // referencing Model's Schema is also here (no need to referencing defenitions)
                    scheme = JSON.parse(request.schema);
                    if (scheme) schema.push(scheme);
                } catch (e) {}
            } else {
                scheme = searchDataStructure(request.content); // Attributes 4
                if (scheme) schema.push(scheme);
                if (request.reference) {
                    schema.push({'$ref': '#/definitions/' + request.reference.id + 'Model'});
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
    // for apib._version = "4.0"
    var mson = content.content[0];
    if (mson.element === 'array') {
        if (!mson.content || mson.content.length === 0) {
            return {type: 'array', items: {}};
        } else if (mson.content.length === 1) {
            return {type: 'array', items: {'$ref': '#/definitions/' + mson.content[0].element}};
        } else if (mson.content.length > 1) {
            var items = [];
            for (var i = 0; i < mson.content.length; i++) {
                items.push({'$ref': '#/definitions/' + mson.content[i].element});
            }
            return {type: 'array', items: {'anyOf': items}};
        }
    }
    if (mson.element !== 'object' && !mson.content) {
        return {'$ref': '#/definitions/' + mson.element};
    }
    // object
    var schema = {};
    schema.type = 'object';
    schema.required = [];
    schema.properties = {};
    for (var j = 0; j < mson.content.length; j++) {
        var member = mson.content[j];
        if (member.element !== "member") continue;
        // MEMO: member.meta.description
        if (member.content.value.element === 'array') {
            // TODO: use member.content.value.content (schema for items)
            schema.properties[member.content.key.content] = {type: 'array', items: {}};
        } else {
            schema.properties[member.content.key.content] = {type: member.content.value.element};
        }
        if (!member.attributes || !member.attributes.typeAttributes) continue;
        for (var k = 0; k < member.attributes.typeAttributes.length; k++) {
            if (member.attributes.typeAttributes[k] === "required") {
                schema.required.push(member.content.key.content);
            }
        }
    }
    if (mson.element !== 'object') {
        return {'allOf': [{'$ref':'#/definitions/' + mson.element}, schema]};
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

function fixArraySchema(schema) {
    if (schema.type === 'array') {
        if (!schema.hasOwnProperty('items')) schema.items = {};
    } else if (schema.type === 'object') {
        for (var k in schema.properties) fixArraySchema(schema.properties[k]);
    }
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
            var swaggerResponse = {
                "description": response.description || http.STATUS_CODES[response.name],
                "headers": {},
                "examples": {}
            };
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
            for (var n = 0; n < response.headers.length; n++) {
                var header = response.headers[n];
                //swaggerResponse.headers[header.name] = {'type':'string'}
                if (header.name === 'Content-Type') {
                    if (header.value.match(/application\/.*json/)) {
                        try {
                            swaggerResponse.examples[header.value] = JSON.parse(response.body);
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

exports.convert = function (data, callback) {
    try {
        var result = drafter.parse(data, {type: 'ast'});
        //for (var i = 0; i < result.warnings.length; i++) {
        //    var warn = result.warnings[i];
        //    console.log(warn);
        //}
        var swagger = apib2swagger(result.ast);
        return callback(null, {swagger: swagger});
    }
    catch (error) {
        return callback(error, {});
    }
};

