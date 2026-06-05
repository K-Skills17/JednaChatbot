# ─── Stage 1: Build client portal (React + Vite) ──────────────
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ─── Stage 2: Build server (TypeScript) ───────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
# Install OpenSSL for Prisma 6 native engine
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/
COPY src ./src/
RUN npx prisma generate
RUN npx tsc
# Copy Prisma engine binaries that tsc doesn't handle
RUN cp src/generated/prisma/*.node dist/generated/prisma/ 2>/dev/null || true
RUN cp src/generated/prisma/schema.prisma dist/generated/prisma/ 2>/dev/null || true

# ─── Stage 3: Production runtime ─────────────────────────────
FROM node:20-alpine
WORKDIR /app
# Install OpenSSL for Prisma 6 native engine
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=client-builder /app/client/dist ./client/dist
COPY prisma ./prisma/
# ESM config for production — avoids needing tsx at runtime
COPY prisma.config.mjs ./
ENV NODE_ENV=production
EXPOSE 3000
# Start server FIRST so Railway health check responds immediately.
# prisma db push runs in the background with a 60s timeout — best-effort.
# Uses --schema flag directly (Prisma 6 compatible, no config file needed).
CMD ["sh", "-c", "(timeout 60 npx prisma db push --accept-data-loss --schema prisma/schema.prisma 2>&1 && echo 'prisma db push succeeded' || echo 'prisma db push skipped') & exec node dist/server.js"]
