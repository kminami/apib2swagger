# apib2swagger

[![Build Status](https://travis-ci.org/kminami/apib2swagger.svg?branch=master)](https://travis-ci.org/kminami/apib2swagger)
[![npm version](https://badge.fury.io/js/apib2swagger.svg)](https://badge.fury.io/js/apib2swagger)

Convert [API Blueprint][] to [Swagger][].

Supported versions:
- API Blueprint 1A9 (with include directive)
- Swagger 2.0
- Node.js 4.x, 5.x, 6.x, 7.x or higher

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
    apib = '...';

apib2swagger.convert(apib, function (error, result) {
    if (!error) console.log(result.swagger);
});
```

## Docker
You can also run apib2swagger inside a docker container. (Unofficial image, use it carefully)

```bash
$ docker run -it --rm -v $(pwd):/docs cbarraford/apib2swagger -i api.md -o swagger.json
```

## License

Copyright (c) 2015 Keisuke Minami

MIT

[API Blueprint]: https://apiblueprint.org/ "API Blueprint"
[Swagger]: http://swagger.io/ "Swagger"
