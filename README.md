# apib2swagger

[![Build Status](https://travis-ci.org/kminami/apib2swagger.svg?branch=master)](https://travis-ci.org/kminami/apib2swagger)
[![Coverage Status](https://coveralls.io/repos/github/kminami/apib2swagger/badge.svg?branch=master)](https://coveralls.io/github/kminami/apib2swagger?branch=master)
[![npm version](https://badge.fury.io/js/apib2swagger.svg)](https://badge.fury.io/js/apib2swagger)

Convert [API Blueprint][] to [Swagger][].

Supported versions:
- API Blueprint 1A9
    - [Metadata section](https://github.com/apiaryio/api-blueprint/blob/master/API%20Blueprint%20Specification.md#def-metadata-section)
        - HOST -> .host, .basePath, .schemes
        - VERSION -> .info.version
    - [Include directive](https://github.com/danielgtaylor/aglio#including-files)
- Swagger 2.0
- Node.js 10.x, 12.x or higher

## Install

```
$ npm install -g apib2swagger
```

## Usage

Convert to Swagger specification.
```shell
$ apib2swagger -i api.md
$ apib2swagger -i api.md -o swagger.json
$ apib2swagger -i api.md --yaml -o swagger.yaml
$ apib2swagger -i api.md --prefer-reference
$ apib2swagger -i api.md --bearer-apikey
```

Without -i option it reads from STDIN, without -o option writes to STDOUT.
```shell
$ apib2swagger < api.md > swagger.json
$ cat api.md | apib2swagger
```

Run http server with SwaggerUI.
SwaggerUI will be automatically downloaded to current dir.
```shell
$ apib2swagger -i api.md -s
$ apib2swagger -i api.md -s -p 3000
```

Use as a library.
```javascript
var apib2swagger = require('apib2swagger'),
    apib = '...',
    options = { preferReference: true, bearerAsApikey: false };

apib2swagger.convert(apib, options, function (error, result) {
    if (!error) console.log(result.swagger);
});
```

## npx

You can run apib2swagger via `npx` (without first needing to install it) like so:
```
cat api.md | npx apib2swagger > swagger.json
```

## Docker
You can also run apib2swagger inside a docker container.

```bash
$ docker run -it --rm -v $(pwd):/docs kminami/apib2swagger -i /docs/api.md -o /docs/swagger.json
```

## License

Copyright (c) 2015 Keisuke Minami

MIT

[API Blueprint]: https://apiblueprint.org/ "API Blueprint"
[Swagger]: http://swagger.io/ "Swagger"
