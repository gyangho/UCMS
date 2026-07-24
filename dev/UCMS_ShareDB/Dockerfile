FROM node:20-slim AS base

WORKDIR /app

COPY package*.json ./

# 2026-07-24: SHAREDB_PORT is injected from infra/env/ports.env; this value is the standalone default.
ENV SHAREDB_PORT=3001

FROM base AS dev
RUN npm install

COPY . .

CMD ["npm", "run", "dev"]

FROM base AS prod
RUN npm ci --only=production

COPY . .

USER node

CMD ["npm", "run", "prod"]
