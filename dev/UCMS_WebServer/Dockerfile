FROM node:20-slim AS base

RUN apt-get update && \
    apt-get install -y python3 python3-pip python-is-python3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python 패키지 설치
COPY InterviewScheduler ./InterviewScheduler
RUN pip3 install --no-cache-dir --break-system-packages -r InterviewScheduler/requirements.txt

COPY package*.json ./

EXPOSE 3000

FROM base AS dev
RUN npm install

COPY . .

CMD ["npm", "run", "dev"]

FROM base AS prod
RUN npm ci --only=production

COPY . .

USER node

CMD ["npm", "run", "prod"]
