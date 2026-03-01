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
COPY prisma.config.ts ./
# Copy prisma CLI from builder so we can run db push at deploy time
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/server.js"]
