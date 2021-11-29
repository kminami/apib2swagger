FROM node:10-alpine

RUN npm install -g git+ssh://git@github.com:HBOCodeLabs/apib2swagger.git

ENTRYPOINT ["apib2swagger"]
