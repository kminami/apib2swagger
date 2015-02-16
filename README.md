# apib2swagger

Convert API Blueprint to Swagger.

## Install

```
$ npm install apib2swagger
```

## Usage

Convert to Swagger specification.
```
$ apib2swagger -i api.md
$ apib2swagger -i api.md -o swagger.json
```

Run http server with SwaggerUI.
SwaggerUI will be automatically downloaded to current dir.
```
$ apib2swagger -i api.md -s
$ apib2swagger -i api.md -s -p 3000
```

As a library.
```
var apib2swagger = require('apib2swagger');
apib2swagger.convert(apib, function (error, result) {
    if (!error) console.log(result.swagger);
});
```

## License

MIT

Copyright (c) 2015 Keisuke Minami

