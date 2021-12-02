FROM node:10-alpine

RUN apk add git
RUN npm install -g HBOCodeLabs/apib2swagger

ENTRYPOINT ["apib2swagger"]