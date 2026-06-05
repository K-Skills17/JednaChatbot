import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

interface LeadIntakeBody {
  instanceName?: string;
  tenantId?: string;
  phone: string;
  name?: string;
  source?: string;
  campaignId?: string;
  protocol?: string;
}

/**
 * POST /api/leads/intake
 * Generic lead intake endpoint for external forms, landing pages, or partner systems.
 * Creates a contact and logs an event. Does NOT trigger a proactive outbound message.
 */
export function registerLeadIntakeRoutes(app: FastifyInstance): void {
  app.post(
    '/api/leads/intake',
    async (request: FastifyRequest<{ Body: LeadIntakeBody }>, reply: FastifyReply) => {
      const { instanceName, tenantId: bodyTenantId, phone, name, source, campaignId } = request.body;

      if (!phone) {
        return reply.code(400).send({ error: 'phone is required' });
      }

      // Resolve tenant by instanceName or direct tenantId
      let tenant;
      if (bodyTenantId) {
        tenant = await prisma.tenant.findUnique({ where: { id: bodyTenantId } });
      } else if (instanceName) {
        tenant = await prisma.tenant.findFirst({
          where: { evolutionInstanceId: instanceName, status: 'active' },
        });
      }

      if (!tenant) {
        return reply.code(404).send({ error: 'Tenant not found' });
      }

      // Normalize phone (remove non-digits, ensure country code)
      const normalizedPhone = phone.replace(/\D/g, '');

      try {
        // Upsert contact
        const contact = await prisma.contact.upsert({
          where: { tenantId_phone: { tenantId: tenant.id, phone: normalizedPhone } },
          update: { lastContactAt: new Date(), name: name ?? undefined },
          create: {
            id: crypto.randomUUID(),
            tenantId: tenant.id,
            phone: normalizedPhone,
            name: name ?? null,
            leadStatus: 'new',
            channel: 'whatsapp',
          },
        });

        // Log event
        await prisma.event.create({
          data: {
            id: crypto.randomUUID(),
            tenantId: tenant.id,
            leadId: contact.id,
            type: 'lead_in',
            payload: { source: source ?? 'lead_form', campaignId },
          },
        });

        logger.info(
          { tenantId: tenant.id, phone: normalizedPhone, source },
          'Lead intake received',
        );

        return reply.send({ ok: true, leadId: contact.id });
      } catch (err) {
        logger.error({ err, phone }, 'Lead intake failed');
        return reply.code(500).send({ error: 'Internal error' });
      }
    },
  );
}
