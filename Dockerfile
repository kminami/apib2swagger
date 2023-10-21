FROM node:18-alpine

RUN npm install -g apib2swagger

ENTRYPOINT ["apib2swagger"]