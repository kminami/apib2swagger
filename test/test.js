var assert = require("assert"),
    fs = require("fs"),
    https = require("https"),
    apib2swagger = require("../lib/main.js");

var remote = 'https://raw.githubusercontent.com/apiaryio/api-blueprint/format-1A8/examples/',
    localInput = 'test/input/',
    localOutput = 'test/output/',
    prepare = false,
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
//        'Gist Fox API + Auth.md',
//        'Gist Fox API.md',
//        'Polls API.md',
//        'Polls Hypermedia API.md',
//        'Real World API.md',
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
            return Promise.all(files.map(fetch));
        });

        files.forEach(function (file) {
            it(file, function (done) {
                var apib = fs.readFileSync(localInput + file, "utf-8");
                apib2swagger.convert(apib, function (error, result) {
                    if (error) {
                        assert.ok(false);
                    } else if (prepare) {
                        fs.writeFileSync(localOutput + file.replace('.md', '.json'), JSON.stringify(result.swagger, 0, 2));
                        assert.ok(true);
                    } else {
                        var f = fs.readFileSync(localOutput + file.replace('.md', '.json'));
                        var answer = JSON.parse(f);
                        assert.deepEqual(result.swagger, answer);
                    }
                    done();
                });
            });
        });
    });
});
