FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/
COPY src ./src/
RUN npx prisma generate
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma/
# ESM config for production — avoids needing tsx at runtime
COPY prisma.config.mjs ./
ENV NODE_ENV=production
EXPOSE 3000
# prisma db push is best-effort — server must always start so health check responds
CMD ["sh", "-c", "npx prisma db push --config prisma.config.mjs 2>&1 && echo 'prisma db push succeeded' || echo 'prisma db push failed — will retry next deploy'; exec node dist/server.js"]
