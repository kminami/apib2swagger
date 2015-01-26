var fs = require('fs');
var exec = require('child_process').exec;
var nopt = require('nopt');
var protagonist = require('protagonist');

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
    //console.log(JSON.stringify(apib));
    var swagger = {};
    swagger.swagger = '2.0';
    swagger.info = {
        'title': apib.name,
        'version': ''
    }
    //swagger.host = apib.metadata[].host;
    swagger.paths = {};
    for (var i = 0; i < apib.resourceGroups.length; i++) {
        var group = apib.resourceGroups[i];
        //console.log("- " + group.name);
        for (var j = 0; j < group.resources.length; j++) {
            var resource = group.resources[j];
            //console.log("-- " + resource.name + " " + resource.uriTemplate);
            swagger.paths[resource.uriTemplate] = swaggerPath(resource, group.name);
        }
    }
    return swagger;
}

function swaggerPath(resource, tag) {
    path = {}
    for (var k = 0; k < resource.actions.length; k++) {
        var action = resource.actions[k];
        //console.log("--- " + action.method);
        path[action.method.toLowerCase()] = {
            'parameters': swaggerParameters(action.parameters),
            'responses': swaggerResponses(action.examples),
            'summary': action.name,
            'description': action.description,
            'tags': [tag]
        }
    }
    return path;
}

function swaggerParameters(parameters) {
    var params = [];
    //console.log(parameters);
    for (var l = 0; l < parameters.length; l++) {
        var parameter = parameters[l];
        //console.log(parameter);
        // "query", "header", "path", "formData", "body"
        params.push({
            'name': parameter.name,
            'in': 'path',
            'description': parameter.description
        });
    }
    return params;
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
            if (response.name === "200") {
                responses['default'] = {};
            } else {
                responses[response.name] = {};
            }
        }
    }
    return responses;
}

function runServer(swagger) {
    var server = require('http').createServer(function(request, response) {
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
