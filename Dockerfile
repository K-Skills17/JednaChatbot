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
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/
COPY src ./src/
RUN npx prisma generate
RUN npx tsc

# ─── Stage 3: Production runtime ─────────────────────────────
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci --omit=dev
# Generate Prisma client in production node_modules
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npx prisma generate
COPY --from=builder /app/dist ./dist
COPY --from=client-builder /app/client/dist ./client/dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/server.js"]
