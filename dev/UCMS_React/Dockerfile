FROM node:20-slim AS base

WORKDIR /app

COPY package*.json ./

# 2026-07-24: Use one React port for Vite development and the production static server.
ENV REACT_PORT=3002

FROM base AS dev
RUN npm install

COPY . .

# 2026-07-24: vite.config.ts reads the Docker-injected REACT_PORT value.
CMD ["npm", "run", "dev"]

FROM base AS build
RUN npm ci

COPY . .

RUN npm run build

# 2026-07-23: Production serves the compiled SPA as static files without running Vite.
FROM nginx:1.28-alpine AS prod

# 2026-07-24: The official Nginx entrypoint renders REACT_PORT at container startup.
ENV REACT_PORT=3002
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${REACT_PORT}/" || exit 1
