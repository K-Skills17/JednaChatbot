import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { sendMessage } from './message.sender';
import { fromWhatsAppJid } from '../../utils/phone.utils';

/**
 * Payload your audit tool sends when a lead completes the audit
 * and needs to receive the report via WhatsApp.
 */
interface AuditLeadPayload {
  /** Tenant ID or Evolution instance name to identify which business */
  tenantId?: string;
  instanceName?: string;

  /** Lead contact info */
  phone: string;
  name?: string;

  /** The audit report message to send via WhatsApp */
  reportMessage: string;

  /** Structured audit data (score, URL audited, key findings, etc.) */
  auditData?: {
    siteUrl?: string;
    overallScore?: number;
    categories?: Record<string, number | string>;
    keyFindings?: string[];
    recommendations?: string[];
    [key: string]: any;
  };
}

export function registerAuditLeadRoutes(app: FastifyInstance): void {
  /**
   * POST /webhook/audit-lead
   *
   * Called by the external audit tool after a lead completes the audit.
   * Creates a contact + conversation with audit context, sends the report,
   * so when the lead replies the chatbot continues from the audit — no greeting restart.
   */
  app.post(
    '/webhook/audit-lead',
    async (request: FastifyRequest<{ Body: AuditLeadPayload }>, reply: FastifyReply) => {
      const { phone, name, reportMessage, auditData, tenantId, instanceName } = request.body;

      if (!phone || !reportMessage) {
        return reply.code(400).send({
          error: 'Missing required fields: phone, reportMessage',
        });
      }

      // Resolve tenant
      let tenant;
      if (tenantId) {
        tenant = await prisma.tenant.findFirst({
          where: { id: tenantId, status: 'active' },
        });
      } else if (instanceName) {
        tenant = await prisma.tenant.findFirst({
          where: { evolutionInstanceId: instanceName, status: 'active' },
        });
      } else {
        // Fallback: use the first active tenant (single-tenant setups)
        tenant = await prisma.tenant.findFirst({
          where: { status: 'active' },
        });
      }

      if (!tenant) {
        return reply.code(404).send({ error: 'No active tenant found' });
      }

      if (!tenant.evolutionInstanceId) {
        return reply.code(400).send({ error: 'Tenant has no WhatsApp instance configured' });
      }

      // Normalize phone (strip WhatsApp JID format if passed)
      const normalizedPhone = phone.includes('@') ? fromWhatsAppJid(phone) : phone;

      // Upsert contact — mark as audit_lead so the chatbot knows context
      const contact = await prisma.contact.upsert({
        where: { tenantId_phone: { tenantId: tenant.id, phone: normalizedPhone } },
        update: {
          name: name ?? undefined,
          leadStatus: 'qualifying',
          lastContactAt: new Date(),
          qualificationData: auditData ? { audit: auditData } : undefined,
        },
        create: {
          tenantId: tenant.id,
          phone: normalizedPhone,
          name: name ?? null,
          leadStatus: 'qualifying',
          qualificationData: auditData ? { audit: auditData } : {},
        },
      });

      // Close any existing active conversation (clean slate for audit flow)
      await prisma.conversation.updateMany({
        where: { tenantId: tenant.id, contactId: contact.id, status: 'active' },
        data: { status: 'closed', closedAt: new Date() },
      });

      // Create new conversation with audit context
      const conversation = await prisma.conversation.create({
        data: {
          tenantId: tenant.id,
          contactId: contact.id,
          status: 'active',
          context: {
            state: 'qualifying' as const,
            extractedData: {
              source: 'audit_tool',
              ...(auditData?.siteUrl ? { siteUrl: auditData.siteUrl } : {}),
              ...(auditData?.overallScore != null ? { auditScore: auditData.overallScore } : {}),
              ...(auditData?.keyFindings ? { auditFindings: auditData.keyFindings } : {}),
              ...(auditData?.recommendations ? { auditRecommendations: auditData.recommendations } : {}),
            },
            qualificationComplete: false,
            messageCount: 0,
            auditReportSent: true,
          },
        },
      });

      // Send the report message via WhatsApp
      await sendMessage({
        tenantId: tenant.id,
        conversationId: conversation.id,
        instanceName: tenant.evolutionInstanceId,
        phone: normalizedPhone,
        text: reportMessage,
      });

      logger.info(
        { phone: normalizedPhone, tenant: tenant.businessName, conversationId: conversation.id },
        'Audit lead report sent and conversation created',
      );

      return reply.code(200).send({
        success: true,
        contactId: contact.id,
        conversationId: conversation.id,
        message: 'Audit report sent. When the lead replies, the chatbot will continue from the audit context.',
      });
    },
  );
}
