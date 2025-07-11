ARG APP_NAME=transaction-service

# Production image
FROM node:20-alpine AS production

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production

COPY --from=development /usr/src/app/dist ./dist

EXPOSE 3000

CMD node dist/apps/${APP_NAME}/main

# Development image
FROM node:20-alpine AS development

ARG APP_NAME

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build ${APP_NAME}
