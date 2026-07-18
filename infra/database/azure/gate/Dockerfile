FROM node:22-alpine3.22

RUN apk add --no-cache ca-certificates postgresql17-client

WORKDIR /app

COPY src/package.json src/package-lock.json ./
RUN npm ci && npm cache clean --force

COPY src/ ./
RUN chmod 0555 scripts/run-azure-database-gate.sh

CMD ["sh", "scripts/run-azure-database-gate.sh"]
