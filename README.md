# apib2swagger

Convert API Blueprint to Swagger.

## Setup

```
$ git clone https://github.com/kminami/apib2swagger.git
$ cd apib2swagger
$ npm install
```

## Usage

Convert to Swagger specification.
```
$ nodejs apib2swagger.js -i api.md
$ nodejs apib2swagger.js -i api.md -o swagger.json
```

Run http server with SwaggerUI.
SwaggerUI will be automatically downloaded to current dir.
```
$ nodejs apib2swagger.js -i api.md -s
$ nodejs apib2swagger.js -i api.md -s -p 3000
```

## License
MIT

