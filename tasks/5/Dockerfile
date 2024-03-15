FROM node:16-alpine

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app

WORKDIR /home/node/app

COPY ./html ./html
COPY ./server.js ./server.js
COPY ./videos ./videos
COPY ./package.json ./package.json

RUN chown node:node /home/node/app

USER node
RUN npm install

EXPOSE 8080

ENTRYPOINT node server.js && bash