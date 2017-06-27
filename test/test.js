var assert = require("assert"),
    fs = require("fs"),
    https = require("https"),
    apib2swagger = require("../index.js"),
    tv4 = require('tv4');

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
        '13. Named Endpoints.md'
    ],
    includedFiles = [
        'Attributes.md',
        'Schema.md',
        'Issue-#15.md',
        'Issue-#22.md',
        'apiblueprint_uber.md',
        'apiblueprint_valid_simple.md'
    ];

var fetch = function (file) {
    if (fs.existsSync(localInput + file)) {
        return Promise.resolve();
    }
    console.log('Downloading ' + remote + file + ')');
    return new Promise(function(resolve, reject) {
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


describe("apib2swagger", function () {
    describe("#convert()", function () {
        before(function () {
            this.timeout(20000); // 20s
            return Promise.all(files.map(fetch));
        });

        schema = JSON.parse(fs.readFileSync('test/swagger_20_schema.json'));
        tv4.addSchema('http://swagger.io/v2/schema.json', schema);
        meta_schema =  JSON.parse(fs.readFileSync('test/meta_schema.json'));
        tv4.addSchema('http://json-schema.org/draft-04/schema', meta_schema);

        files.concat(includedFiles).forEach(function (file) {
            it(file, function (done) {
                this.timeout(10000); // 10s
                var apib = fs.readFileSync(localInput + file, "utf-8");
                apib2swagger.convert(apib, function (error, result) {
                    if (error) {
                        return done(error);
                    }

                    if (prepare) {
                        fs.writeFileSync(localOutput + file.replace('.md', '.json'), JSON.stringify(result.swagger, 0, 2));
                        assert.ok(true);
                    } else {
                        var f = fs.readFileSync(localOutput + file.replace('.md', '.json'));
                        var expected_answer = JSON.parse(f);
                        assert.deepEqual(result.swagger, expected_answer);
                        var validation_result = tv4.validateResult(result.swagger, schema);
                        assert(validation_result.valid);
                        assert(validation_result.missing.length === 0)
                    }
                    done();
                });
            });
        });
    });
});
