FROM node:20-slim AS base

WORKDIR /app

COPY package*.json ./

EXPOSE 8080

FROM base AS dev
RUN npm install

COPY . .

CMD ["npm", "run", "dev"]

FROM base AS prod
RUN npm ci --only=production

COPY . .

USER node

CMD ["npm", "run", "prod"]
