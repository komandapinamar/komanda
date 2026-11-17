# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Komanda Core — imagen unica, tres roles.
#
# El mismo artefacto corre como:
#   web               -> npm run start          (Next.js, puerto 3000)
#   fastify           -> npm run start:fastify  (SSE/print/health, puerto 3001)
#   worker            -> npm run outbox:dispatch / payments:reconcile
#
# Se usa node_modules completo en runtime (sin --omit=dev) para poder ejecutar
# Fastify y los workers con tsx, que es el mismo runner del entorno de
# desarrollo. Para un VPS el tamano de imagen no importa; la simplicidad si.
# ---------------------------------------------------------------------------

FROM node:24-slim AS deps
WORKDIR /app
# bcrypt y otras dependencias nativas necesitan toolchain para compilar.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY . .
EXPOSE 3000 3001
CMD ["npm", "run", "start"]
