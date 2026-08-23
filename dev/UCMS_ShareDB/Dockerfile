FROM node:24-slim AS base

WORKDIR /app

COPY package*.json ./

# 2026-07-24: SHAREDB_PORT is injected from infra/env/ports.env; this value is the standalone default.
ENV SHAREDB_PORT=3001

# 2026-08-19: A TCP probe verifies that the WebSocket listener is accepting connections.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
    CMD node -e "const net=require('net');const s=net.connect(Number(process.env.SHAREDB_PORT||3001),'127.0.0.1');s.setTimeout(3000);s.on('connect',()=>{s.end();process.exit(0)});s.on('timeout',()=>process.exit(1));s.on('error',()=>process.exit(1))"

FROM base AS dev
RUN npm install

COPY . .

CMD ["npm", "run", "dev"]

FROM base AS prod
RUN npm ci --only=production

COPY . .

USER node

CMD ["npm", "run", "prod"]
