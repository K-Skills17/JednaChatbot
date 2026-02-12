import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { logger } from './utils/logger';
import { registerTenantRoutes } from './modules/tenant/tenant.routes';
import { registerWebhookRoutes } from './modules/whatsapp/webhook.handler';

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

  app.get('/health/ready', async () => {
    // Phase 2: check DB + Redis + Evolution connectivity
    return { status: 'ready' };
  });

  // ─── Routes ───────────────────────────────────────────────

  registerWebhookRoutes(app);
  registerTenantRoutes(app);

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
