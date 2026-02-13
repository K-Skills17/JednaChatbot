import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { logger } from './utils/logger';
import { registerTenantRoutes } from './modules/tenant/tenant.routes';
import { registerBookingRoutes } from './modules/booking/booking.routes';
import { registerCampaignRoutes } from './modules/campaign/campaign.routes';
import { registerAnalyticsRoutes } from './modules/analytics/analytics.routes';
import { registerWebhookRoutes } from './modules/whatsapp/webhook.handler';
import { env } from './config/env';
import { prisma } from './config/database';
import { redis } from './config/redis';

export async function buildApp() {
  const app = Fastify({
    logger: false, // We use our own pino instance
    trustProxy: true,
  });

  // ─── Plugins ──────────────────────────────────────────────

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(helmet);

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // ─── Health Check ─────────────────────────────────────────

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  app.get('/health/ready', async (_request, reply) => {
    const checks: Record<string, 'ok' | 'error' | 'skipped'> = {};

    // Database check
    if (env.DATABASE_URL) {
      try {
        await prisma.$queryRawUnsafe('SELECT 1');
        checks.database = 'ok';
      } catch {
        checks.database = 'error';
      }
    } else {
      checks.database = 'skipped';
    }

    // Redis check
    if (env.REDIS_URL && env.REDIS_URL !== 'redis://localhost:6379') {
      try {
        await redis.ping();
        checks.redis = 'ok';
      } catch {
        checks.redis = 'error';
      }
    } else {
      checks.redis = 'skipped';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok' || v === 'skipped');
    const status = allOk ? 'ready' : 'degraded';

    return reply.code(allOk ? 200 : 503).send({ status, checks });
  });

  // ─── Routes (each wrapped in register() for hook encapsulation) ───

  app.register(async (instance) => registerWebhookRoutes(instance));
  app.register(async (instance) => registerTenantRoutes(instance));
  app.register(async (instance) => registerBookingRoutes(instance));
  app.register(async (instance) => registerCampaignRoutes(instance));
  app.register(async (instance) => registerAnalyticsRoutes(instance));

  // ─── Error Handler ────────────────────────────────────────

  app.setErrorHandler((error: Error & { statusCode?: number; validation?: unknown }, request, reply) => {
    logger.error({ err: error, url: request.url, method: request.method }, 'Request error');

    if (error.validation) {
      return reply.code(400).send({ error: 'Validation error', details: error.message });
    }

    const statusCode = error.statusCode ?? 500;
    reply.code(statusCode).send({
      error: statusCode >= 500 ? 'Internal server error' : error.message,
    });
  });

  // ─── Not Found Handler ────────────────────────────────────

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: 'Route not found', path: request.url });
  });

  return app;
}
