#!/usr/bin/env node

var fs = require('fs'),
    http = require('http'),
    https = require('https'),
    exec = require('child_process').exec,
    path = require('path'),
    nopt = require('nopt'),
    yaml = require('js-yaml'),
    apibIncludeDirective = require('apib-include-directive'),
    apib2swagger = require('../index.js'),
    util = require('../src/util');

var options = nopt({
    'input': String,
    'output': String,
    'convert': Boolean,
    'server': Boolean,
    'port': Number,
    'yaml': Boolean,
    'prefer-reference': Boolean,
    'bearer-apikey': Boolean,
    'help': Boolean,
    'open-api-3': Boolean,
    'info-title': String,
    'prefer-file-ref': Boolean,
    'source-dir': String
}, {
    'i': ['--input'],
    'o': ['--output'],
    's': ['--server'],
    'p': ['--port'],
    'y': ['--yaml'],
    'h': ['--help'],
    'sd': ['--source-dir']
});

if (options.help) {
    console.log("apib2swagger [options]");
    console.log("Converts API Blueprint specification to Swagger 2.0");
    console.log("");
    console.log("Usage:");
    console.log(" apib2swagger");
    console.log(" apib2swagger -i api.md");
    console.log(" apib2swagger -i api.md -o swagger.json");
    console.log(" apib2swagger -i api.md -s");
    console.log(" apib2swagger -i api.md -s -p 3000");
    console.log("");
    console.log("Options:")
    console.log("  -h --help Print this help and exit.");
    console.log("  -i --input <file> Use file as input instead of STDIN.");
    console.log("  -o --output <file> Output result to file instead of STDOUT.");
    console.log("  -s --server Run http server with SwaggerUI.");
    console.log("  -p --port <port> Use port for the http server.");
    console.log("  -y --yaml Output YAML");
    console.log("  -sd --source-dir Specify a source directory to serve file references from.");
    console.log("  --prefer-reference Refer to definitions as possible");
    console.log("  --bearer-apikey Convert Bearer headers to apiKey security schema instead of oauth2")
    console.log("  --open-api-3 Output as OpenAPI 3.0 instead of the default Swagger 2.0")
    console.log("  --info-title Optional info.title")
    console.log("  --prefer-file-ref Create refs to file paths instead of importing the content.")
    process.exit();
}

var swaggerUI = 'https://codeload.github.com/swagger-api/swagger-ui/tar.gz/master',
    output = options.output || '-',
    port = options.port || 3000;

var includePath = options.input ? path.dirname(options.input) : process.cwd();
var apibData = '';
(options.input ? fs.createReadStream(options.input) : process.stdin).
on('data', (chunk) => {
    apibData += chunk;
}).on('end', () => {
    try {
        apibData = util.normalizeIncludes(apibData)
        
        if (!options['prefer-file-ref']){
            apibData = apibIncludeDirective.includeDirective(includePath, apibData);
        }
    } catch(e) {
      console.log(e.toString());
      return;
    }
    processBlueprint(apibData, options);
});

function processBlueprint(blueprint, opts) {
    if (opts.convert === false) { // --no-convert
        apib2swagger.noconvert(blueprint, function(error, result) {
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

    var options = {
        preferReference: opts['prefer-reference'],
        bearerAsApikey: opts['bearer-apikey'],
        openApi3: opts['open-api-3'],
        infoTitle: opts['info-title'],
        preferFileRef: opts['prefer-file-ref']
    };
    apib2swagger.convert(blueprint, options, function(error, result) {
        if (error) {
            console.log(error);
            return;
        }
        var swagger = result.swagger;
        if (opts.server) {
            if (!fs.existsSync('swagger-ui-master/dist')) {
                console.log('SwaggerUI is not found.');
                downloadSwagger(function() {
                    runServer(swagger);
                });
                return;
            }
            return runServer(swagger);
        }
        if (opts.yaml) {
            var data = yaml.dump(swagger);
            if (output !== '-') {
                fs.writeFileSync(output, data);
            } else {
                console.log(data);
            }
            return;
        }
        var data = JSON.stringify(swagger, null, 4);
        if (output !== '-') {
            fs.writeFileSync(output, data);
        } else {
            console.log(data);
        }
    });
}

function serveFile(response, path){
    response.statusCode = 200;
    response.write(fs.readFileSync(path));
    response.end();
    return;
}

function runServer(swagger) {
    var server = http.createServer(function(request, response) {
        var filePath = request.url.split('?')[0];
        if (filePath === '/swagger.json') {
            response.statusCode = 200;
            response.write(JSON.stringify(swagger));
            response.end();
        } else if (filePath === '/') {
            response.statusCode = 302;
            response.setHeader('Location', '/index.html?url=/swagger.json');
            response.end();
        } else {
            const swaggerFile = 'swagger-ui-master/dist' + filePath;
            if (fs.existsSync(swaggerFile)) return serveFile(response, swaggerFile)

            const file = util.getAbsolutePath(options, filePath)
            if (file) return serveFile(response, file)

            response.statusCode = 404;
            response.end();
            return;
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
