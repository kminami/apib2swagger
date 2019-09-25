FROM node:10-alpine

RUN npm install -g apib2swagger

ENTRYPOINT ["apib2swagger"]