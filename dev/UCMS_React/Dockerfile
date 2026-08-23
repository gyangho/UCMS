FROM node:24-slim AS base

WORKDIR /app

COPY package*.json ./

# 2026-07-24: Use one React port for Vite development and the production static server.
ENV REACT_PORT=3002

# 2026-08-19: Development images expose Vite on the same configured port and report readiness to Compose.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.REACT_PORT || 3002) + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

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
