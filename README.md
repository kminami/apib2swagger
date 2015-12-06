# apib2swagger

[![Build Status](https://travis-ci.org/kminami/apib2swagger.svg?branch=master)](https://travis-ci.org/kminami/apib2swagger)
[![npm version](https://badge.fury.io/js/apib2swagger.svg)](https://badge.fury.io/js/apib2swagger)

Convert [API Blueprint][] to [Swagger][].

Support version:
- API Blueprint 1A9 (>=0.3.1)
- Swagger 2.0
- Node.js 0.12, 4.0, 4.1, or higher (>=0.4.0)

## Install

```
$ npm install -g apib2swagger
```

## Usage

Convert to Swagger specification.
```shell
$ apib2swagger -i api.md
$ apib2swagger -i api.md -o swagger.json
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

## License

Copyright (c) 2015 Keisuke Minami

MIT

[API Blueprint]: https://apiblueprint.org/ "API Blueprint"
[Swagger]: http://swagger.io/ "Swagger"

