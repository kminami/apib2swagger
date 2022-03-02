var assert = require("assert"),
    fs = require("fs"),
    https = require("https"),
    apib2swagger = require("../index.js"),
    tv4 = require('tv4');

const swaggerSchema = JSON.parse(fs.readFileSync('test/swagger_20_schema.json'));
const openAPI3Schema = JSON.parse(fs.readFileSync('test/openAPI_30_schema.json'))
const meta_schema = JSON.parse(fs.readFileSync('test/meta_schema.json'));

tv4.addSchema('http://json-schema.org/draft-04/schema', meta_schema);
tv4.addSchema('https://spec.openapis.org/oas/3.0/schema/2021-09-28', openAPI3Schema);
tv4.addSchema('http://swagger.io/v2/schema.json', swaggerSchema);
      
var remote = 'https://raw.githubusercontent.com/apiaryio/api-blueprint/format-1A9/examples/',
    localInput = 'test/input/',
    localOutput = 'test/output/',
    prepare = process.env.PREPARE === "true",
    files = [
        '01. Simplest API.md',
        '02. Resource and Actions.md',
        '03. Named Resource and Actions.md',
        '04. Grouping Resources.md',
        '05. Responses.md',
        '06. Requests.md',
        '07. Parameters.md',
        '08. Attributes.md',
        '09. Advanced Attributes.md',
        '10. Data Structures.md',
        '11. Resource Model.md',
        '12. Advanced Action.md',
        '13. Named Endpoints.md',
        'Gist Fox API + Auth.md'

    ],
    includedFiles = [
        'Attributes.md',
        'Schema.md',
        'Issue-#15.md',
        'Issue-#22.md',
        'Issue-#23.md',
        'Issue-#26.md',
        'Issue-#29.md',
        'Issue-#33.md',
        'Issue-#35.md',
        'Issue-#36.md',
        'Issue-#38.md',
        'Issue-#49.md',
        'Issue-#57.md',
        'apiblueprint_uber.md',
        'apiblueprint_valid_simple.md',
        'schema_without_body.md',
        'OpenAPI3_responses.md',
        'OpenAPI3_requests.md',
        'OpenAPI3_headers.md',
        'OpenAPI3_includes.md',
        'OpenAPI3_attributes.md',
        'OpenAPI3_Issue-#58.md'
    ];

var fetch = function (file) {
    if (fs.existsSync(localInput + file)) {
        return Promise.resolve();
    }
    console.log('Downloading ' + remote + file + ')');
    return new Promise(function (resolve, reject) {
        https.get(remote + file, function (res) {
            if (res.statusCode !== 200) {
            }
            var w = fs.createWriteStream(localInput + file);
            res.pipe(w);
            res.on('end', function () {
                resolve();
            })
        }).on('error', function (e) {
            console.error(e);
            reject(e);
        });
    });
};

/**
 * Checks if the result obtained from the input file is the same as reference output
 * 
 * @param {string} result Conversion output
 * @param {string} file Input file of conversion
 * @param {string} originalExtension Original extension of input file
 * @param {string} newExtension Extension of test assertion file
 */
const checkResultByFile = (result, file, originalExtension, newExtension) => {
    if (prepare) {
        fs.writeFileSync(localOutput + file.replace(originalExtension, newExtension), JSON.stringify(result.swagger, 0, 2));
        assert.ok(true);
    } else {
        var f = fs.readFileSync(localOutput + file.replace(originalExtension, newExtension));
        var expected_answer = JSON.parse(f);
        assert.deepEqual(result.swagger, expected_answer);
        const schema = file.includes('OpenAPI3') ? openAPI3Schema : swaggerSchema
        var validation_result = tv4.validateResult(result.swagger, schema);
        if (validation_result.error) {
            console.log(validation_result);
        }
        assert(validation_result.valid);
        assert(validation_result.missing.length === 0)
    }
}

describe("apib2swagger", function () {
    describe("#convert()", function () {
        before(function () {
            this.timeout(20000); // 20s
            return Promise.all(files.map(fetch));
        });

        files.concat(includedFiles).forEach(function (file) {
            const options = {}
            if (file.includes('OpenAPI3')){
                options.openApi3 = true
            }

            it(file, function (done) {
                this.timeout(10000); // 10s
                var apib = fs.readFileSync(localInput + file, "utf-8").replace(/\r/g, '');
                apib2swagger.convert(apib, options, function (error, result) {
                    if (error) {
                        return done(error);
                    }

                    checkResultByFile(result, file, '.md', '.json');
                    done();
                });
            });

            it(file + ' (--prefer-reference)', function (done) {
                this.timeout(10000); // 10s
                var apib = fs.readFileSync(localInput + file, "utf-8").replace(/\r/g, '');
                apib2swagger.convert(apib, { ...options, preferReference: true }, function (error, result) {
                    if (error) {
                        return done(error);
                    }

                    checkResultByFile(result, file, '.md', '.ref.json');
                    done();
                });
            });
        });

        var versionTests = [
            { input: 'VERSION: 1.0.0', output: '1.0.0' },
            { input: 'Version: 2.0', output: '2.0' },
            { input: 'version: 3', output: '3' },
        ];
        versionTests.forEach(function (test) {
            it(test.input, function (done) {
                apib2swagger.convert(test.input, function (error, result) {
                    if (error) {
                        return done(error);
                    }
                    assert.equal(result.swagger.info.version, test.output);
                    var validation_result = tv4.validateResult(result.swagger, swaggerSchema);
                    if (validation_result.error) {
                        console.log(validation_result);
                    }
                    assert(validation_result.valid);
                    assert(validation_result.missing.length === 0)
                    done();
                });
            });
        });

        it('Issue-#38.md (--bearer-apikey', function (done) {
            const file = 'Issue-#38.md';
            this.timeout(10000); // 10s
            var apib = fs.readFileSync(localInput + file, "utf-8").replace(/\r/g, '');
            apib2swagger.convert(apib, { bearerAsApikey: true }, function (error, result) {
                if (error) {
                    return done(error);
                }

                checkResultByFile(result, file, '.md', '.bearer.json');
                done();
            });
        });
    });

    describe("#noconvert()", function () {
        it('success', function (done) {
            apib2swagger.noconvert('', function (error, result) {
                if (error) {
                    return done(error);
                }
                done();
            });
        });
        it('fail', function (done) {
            apib2swagger.noconvert(null, function (error, result) {
                if (!error) {
                    return done(new Error());
                }
                done();
            });
        });
    });
});
