import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { campaignService } from './campaign.service';
import { authMiddleware } from '../../middleware/auth';
import { createCampaignSchema, addContactsSchema } from './campaign.types';

export function registerCampaignRoutes(app: FastifyInstance): void {
  app.addHook('preHandler', authMiddleware);

  // Create a campaign
  app.post(
    '/api/tenants/:tenantId/campaigns',
    async (
      request: FastifyRequest<{
        Params: { tenantId: string };
        Body: unknown;
      }>,
      reply: FastifyReply,
    ) => {
      const parsed = createCampaignSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
      }
      const campaign = await campaignService.create(request.params.tenantId, parsed.data);
      return reply.code(201).send(campaign);
    },
  );

  // List campaigns
  app.get(
    '/api/tenants/:tenantId/campaigns',
    async (
      request: FastifyRequest<{ Params: { tenantId: string } }>,
      reply: FastifyReply,
    ) => {
      const campaigns = await campaignService.listByTenant(request.params.tenantId);
      return reply.send(campaigns);
    },
  );

  // Get single campaign
  app.get(
    '/api/tenants/:tenantId/campaigns/:id',
    async (
      request: FastifyRequest<{ Params: { tenantId: string; id: string } }>,
      reply: FastifyReply,
    ) => {
      const campaign = await campaignService.getById(request.params.id, request.params.tenantId);
      if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });
      return reply.send(campaign);
    },
  );

  // Add contacts to campaign
  app.post(
    '/api/tenants/:tenantId/campaigns/:id/contacts',
    async (
      request: FastifyRequest<{
        Params: { tenantId: string; id: string };
        Body: unknown;
      }>,
      reply: FastifyReply,
    ) => {
      const parsed = addContactsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
      }
      const result = await campaignService.addContacts(
        request.params.id,
        request.params.tenantId,
        parsed.data,
      );
      return reply.send(result);
    },
  );

  // Start campaign
  app.post(
    '/api/tenants/:tenantId/campaigns/:id/start',
    async (
      request: FastifyRequest<{ Params: { tenantId: string; id: string } }>,
      reply: FastifyReply,
    ) => {
      await campaignService.start(request.params.id, request.params.tenantId);
      return reply.send({ status: 'active' });
    },
  );

  // Pause campaign
  app.post(
    '/api/tenants/:tenantId/campaigns/:id/pause',
    async (
      request: FastifyRequest<{ Params: { tenantId: string; id: string } }>,
      reply: FastifyReply,
    ) => {
      await campaignService.pause(request.params.id, request.params.tenantId);
      return reply.send({ status: 'paused' });
    },
  );

  // Campaign analytics
  app.get(
    '/api/tenants/:tenantId/campaigns/:id/analytics',
    async (
      request: FastifyRequest<{ Params: { tenantId: string; id: string } }>,
      reply: FastifyReply,
    ) => {
      const analytics = await campaignService.getAnalytics(
        request.params.id,
        request.params.tenantId,
      );
      return reply.send(analytics);
    },
  );
}
