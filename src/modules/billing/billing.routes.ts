import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { billingService } from './billing.service';
import { authMiddleware } from '../../middleware/auth';

export function registerBillingRoutes(app: FastifyInstance): void {
  // All billing routes require API key
  app.addHook('preHandler', authMiddleware);

  // Get billing overview for a tenant
  app.get(
    '/api/tenants/:tenantId/billing',
    async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
      const overview = await billingService.getBillingOverview(request.params.tenantId);
      return reply.send(overview);
    },
  );

  // Get current subscription
  app.get(
    '/api/tenants/:tenantId/billing/subscription',
    async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
      const subscription = await billingService.getSubscription(request.params.tenantId);
      if (!subscription) return reply.send({ subscription: null });
      return reply.send({ subscription });
    },
  );

  // Create checkout session (start new subscription or upgrade)
  app.post(
    '/api/tenants/:tenantId/billing/checkout',
    async (
      request: FastifyRequest<{
        Params: { tenantId: string };
        Body: { plan: string; successUrl: string; cancelUrl: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { plan, successUrl, cancelUrl } = request.body ?? {};

      if (!plan || !successUrl || !cancelUrl) {
        return reply.code(400).send({
          error: 'Missing required fields: plan, successUrl, cancelUrl',
        });
      }

      if (!['starter', 'pro', 'enterprise'].includes(plan)) {
        return reply.code(400).send({ error: 'Invalid plan. Must be: starter, pro, enterprise' });
      }

      try {
        const session = await billingService.createCheckoutSession(
          request.params.tenantId,
          plan,
          successUrl,
          cancelUrl,
        );
        return reply.send(session);
      } catch (err: any) {
        if (err.message.includes('No Stripe price configured')) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // Create customer portal session (manage existing subscription)
  app.post(
    '/api/tenants/:tenantId/billing/portal',
    async (
      request: FastifyRequest<{
        Params: { tenantId: string };
        Body: { returnUrl: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { returnUrl } = request.body ?? {};

      if (!returnUrl) {
        return reply.code(400).send({ error: 'Missing required field: returnUrl' });
      }

      try {
        const session = await billingService.createPortalSession(
          request.params.tenantId,
          returnUrl,
        );
        return reply.send(session);
      } catch (err: any) {
        if (err.message.includes('no Stripe customer')) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // List invoices
  app.get(
    '/api/tenants/:tenantId/billing/invoices',
    async (
      request: FastifyRequest<{
        Params: { tenantId: string };
        Querystring: { page?: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const page = parseInt(request.query.page ?? '1', 10);
      const limit = parseInt(request.query.limit ?? '20', 10);
      const result = await billingService.listInvoices(request.params.tenantId, page, limit);
      return reply.send(result);
    },
  );
}
