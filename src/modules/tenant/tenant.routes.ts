import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { tenantService } from './tenant.service';
import { createTenantSchema, updateTenantSchema } from './tenant.schema';
import { authMiddleware } from '../../middleware/auth';

export function registerTenantRoutes(app: FastifyInstance): void {
  // All tenant routes require API key
  app.addHook('preHandler', authMiddleware);

  // Create tenant
  app.post(
    '/api/tenants',
    async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
      const parsed = createTenantSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
      }

      try {
        const tenant = await tenantService.create(parsed.data);
        return reply.code(201).send(tenant);
      } catch (err: any) {
        const message = err?.message ?? 'Failed to create tenant';
        if (message.includes('Invalid Brazilian phone number')) {
          return reply.code(400).send({ error: message });
        }
        throw err;
      }
    },
  );

  // List tenants
  app.get(
    '/api/tenants',
    async (request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>, reply: FastifyReply) => {
      const page = parseInt(request.query.page ?? '1', 10);
      const limit = parseInt(request.query.limit ?? '20', 10);
      const result = await tenantService.list(page, limit);
      return reply.send(result);
    },
  );

  // Get tenant by ID
  app.get(
    '/api/tenants/:tenantId',
    async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
      const tenant = await tenantService.getById(request.params.tenantId);
      if (!tenant) return reply.code(404).send({ error: 'Tenant not found' });
      return reply.send(tenant);
    },
  );

  // Update tenant
  app.patch(
    '/api/tenants/:tenantId',
    async (request: FastifyRequest<{ Params: { tenantId: string }; Body: any }>, reply: FastifyReply) => {
      const parsed = updateTenantSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
      }

      try {
        const tenant = await tenantService.update(request.params.tenantId, parsed.data);
        return reply.send(tenant);
      } catch (err: any) {
        const message = err?.message ?? 'Failed to update tenant';
        if (message.includes('Invalid Brazilian phone number')) {
          return reply.code(400).send({ error: message });
        }
        throw err;
      }
    },
  );

  // Delete tenant
  app.delete(
    '/api/tenants/:tenantId',
    async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
      await tenantService.delete(request.params.tenantId);
      return reply.code(204).send();
    },
  );

  // Connect WhatsApp (returns QR code)
  app.post(
    '/api/tenants/:tenantId/connect',
    async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
      const qr = await tenantService.connectWhatsApp(request.params.tenantId);
      return reply.send(qr);
    },
  );

  // Get WhatsApp connection status
  app.get(
    '/api/tenants/:tenantId/status',
    async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
      const status = await tenantService.getWhatsAppStatus(request.params.tenantId);
      return reply.send(status);
    },
  );

  // (Re)configure webhook for a tenant's Evolution instance
  app.post(
    '/api/tenants/:tenantId/webhook',
    async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
      const result = await tenantService.setupWebhook(request.params.tenantId);
      return reply.send(result);
    },
  );
}
