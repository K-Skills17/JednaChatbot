import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { analyticsService } from './analytics.service';
import { authMiddleware } from '../../middleware/auth';

export function registerAnalyticsRoutes(app: FastifyInstance): void {
  app.addHook('preHandler', authMiddleware);

  // Dashboard overview
  app.get(
    '/api/tenants/:tenantId/analytics/overview',
    async (
      request: FastifyRequest<{ Params: { tenantId: string } }>,
      reply: FastifyReply,
    ) => {
      const overview = await analyticsService.getOverview(request.params.tenantId);
      return reply.send(overview);
    },
  );

  // Lead funnel
  app.get(
    '/api/tenants/:tenantId/analytics/funnel',
    async (
      request: FastifyRequest<{ Params: { tenantId: string } }>,
      reply: FastifyReply,
    ) => {
      const funnel = await analyticsService.getLeadFunnel(request.params.tenantId);
      return reply.send(funnel);
    },
  );

  // Daily metrics (time series)
  app.get(
    '/api/tenants/:tenantId/analytics/daily',
    async (
      request: FastifyRequest<{
        Params: { tenantId: string };
        Querystring: { days?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const days = request.query.days ? parseInt(request.query.days, 10) : 30;
      const metrics = await analyticsService.getDailyMetrics(request.params.tenantId, days);
      return reply.send(metrics);
    },
  );
}
