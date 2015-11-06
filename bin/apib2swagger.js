#!/usr/bin/env node

var fs = require('fs'),
    http = require('http'),
    https = require('https'),
    exec = require('child_process').exec,
    nopt = require('nopt'),
    apib2swagger = require('../index.js');

var options = nopt({
    'input': String,
    'output': String,
    'convert': Boolean,
    'server': Boolean,
    'port': Number
}, {
    'i': ['--input'],
    'o': ['--output'],
    's': ['--server'],
    'p': ['--port']
});

if (!options.input) {
    console.log("Usage: apib2swagger -i api.md");
    console.log("       apib2swagger -i api.md -o swagger.json");
    console.log("       apib2swagger -i api.md -s");
    console.log("       apib2swagger -i api.md -s -p 3000");
    process.exit();
}

//var swaggerUI = 'https://github.com/swagger-api/swagger-ui/archive/master.tar.gz',
var swaggerUI = 'https://codeload.github.com/swagger-api/swagger-ui/tar.gz/master',
    output = options.output || '-',
    port = options.port || 3000,
    apibData = fs.readFileSync(options.input, {encoding: 'utf8'});

if (options.convert === false) { // --no-convert
    apib2swagger.noconvert(apibData, function(error, result) {
        if (error) {
            console.log(error);
            return;
        }
        var data = JSON.stringify(result.ast, null, 4);
        if (output !== '-') {
            fs.writeFileSync(output, data);
        } else {
            console.log(data);
        }
    });
    return;
}

apib2swagger.convert(apibData, function(error, result) {
    if (error) {
        console.log(error);
        return;
    }
    var swagger = result.swagger;
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
    https.get(swaggerUI, function (res) {
        if (res.statusCode === 200) {
        }
        var w = fs.createWriteStream(filename);
        res.pipe(w);
        res.on('end', function () {
            extract(filename, callback);
        })
    }).on('error', function (e) {
        console.error(e);
    });
    //exec('wget ' + swaggerUI + ' -O ' + filename, function (err, stdout, stderr) {
    //    if (err) {
    //        console.log(stdout);
    //        console.log(stderr);
    //        return;
    //    }
    //    extract(filename, callback);
    //});
}

function extract(filename, callback) {
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
}

