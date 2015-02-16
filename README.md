# apib2swagger

Convert [API Blueprint][] to [Swagger][].

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
SwaggerUI will be automatically downloaded to current dir. (requires wget)
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

