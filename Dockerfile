FROM node:16-alpine

RUN npm install -g apib2swagger

ENTRYPOINT ["apib2swagger"]