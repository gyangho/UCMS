FROM node:20-slim AS base

WORKDIR /app

COPY package*.json ./

EXPOSE 5173

FROM base AS dev
RUN npm install

COPY . .

# 2026-07-16: Run Vite on all interfaces so the dev server is reachable from Docker Compose.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM base AS build
RUN npm ci

COPY . .

RUN npm run build
