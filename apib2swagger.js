var fs = require('fs');
var http = require('http');
var url = require('url');
var exec = require('child_process').exec;

var nopt = require('nopt');
var protagonist = require('protagonist');
var UriTemplate = require('uritemplate');

var options = nopt({
    'input': String,
    'output': String,
    'server': Boolean,
    'port': Number
},{
    'i': ['--input'],
    'o': ['--output'],
    's': ['--server'],
    'p': ['--port']
});

if (!options.input) {
    console.log("Usage: nodejs apib2swagger.js -i api.md");
    console.log("       nodejs apib2swagger.js -i api.md -o swagger.json");
    console.log("       nodejs apib2swagger.js -i api.md -s");
    console.log("       nodejs apib2swagger.js -i api.md -s -p 3000");
    process.exit();
}
var output = options.output || '-';
var port = options.port || 3000;

var swaggerUI = 'https://github.com/swagger-api/swagger-ui/archive/master.tar.gz';
var apibData = fs.readFileSync(options.input, {'encoding':'utf8'});

protagonist.parse(apibData, function(error, result) {
    if (error) {
        console.log(error);
        return;
    }
    var swagger = apib2swagger(result.ast);
    if (options.server) {
        if (!fs.existsSync('swagger-ui-master/dist')) {
            console.log('SwaggerUI is not found.');
            downloadSwagger(function() {
                runServer(swagger);
            });
            return;
        }
        return runServer(swagger);
    }
    var data = JSON.stringify(swagger, null, 4);
    if (output !== '-') {
        fs.writeFileSync(output, data);
    } else {
        console.log(data);
    }
});

function apib2swagger(apib) {
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
            swagger.paths[resource.uriTemplate] = swaggerPath(resource.actions, group.name, uriTemplate);
        }
    }
    return swagger;
}

function swaggerPath(actions, tag, uriTemplate) {
    path = {}
    for (var k = 0; k < actions.length; k++) {
        var action = actions[k];
        //console.log("--- " + action.method);
        var operation = {
            'responses': swaggerResponses(action.examples),
            'summary': action.name,
            'description': action.description,
            'tags': [tag]
        }
        if (action.parameters.length > 0) {
            operation.parameters = swaggerParameters(action.parameters, uriTemplate);
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

function runServer(swagger) {
    var server = http.createServer(function(request, response) {
        console.log(request.url);
        var path = request.url.split('?')[0];
        if (path === '/swagger.json') {
            response.statusCode = 200;
            response.write(JSON.stringify(swagger));
            response.end();
        } else if (path === '/') {
            response.statusCode = 302;
            response.setHeader('Location', '/index.html?url=/swagger.json');
            response.end();
        } else {
            var file = 'swagger-ui-master/dist' + path;
            if (!fs.existsSync(file)) {
                response.statusCode = 404;
                response.end();
                return;
            }
            response.statusCode = 200;
            response.write(fs.readFileSync(file));
            response.end();
        }
    });
    console.log('Serving http://0.0.0.0:' + port + '/ ...');
    server.listen(port);
}

function downloadSwagger(callback) {
    var filename = 'swagger-ui-master.tar.gz';
    console.log('Downloading SwaggerUI (' + swaggerUI + ')');
    exec('wget ' + swaggerUI + ' -O ' + filename, function (err, stdout, stderr) {
        if (err) {
            console.log(stdout);
            console.log(stderr);
            return;
        }
        console.log('Extracting ' + filename);
        exec('tar xzvf ' + filename, function (err, stdout, stderr) {
            if (err) {
                console.log(stdout);
                console.log(stderr);
                return;
            }
            console.log('Complete!');
            callback();
        });
    });
}
