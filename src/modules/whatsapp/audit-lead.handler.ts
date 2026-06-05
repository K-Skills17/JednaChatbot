import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { sendMessage } from './message.sender';
import { fromWhatsAppJid } from '../../utils/phone.utils';
import { getProvider, getModelForTier } from '../../ai/ai.router';
import { env } from '../../config/env';

/**
 * Payload sent by external tools (audit tool, n8n FB lead capture, etc.)
 * to inject a lead into the chatbot and start a conversation.
 */
interface AuditLeadPayload {
  /** Tenant ID or Evolution instance name to identify which business */
  tenantId?: string;
  instanceName?: string;

  /** Lead contact info */
  phone: string;
  name?: string;

  /** The message to send via WhatsApp. If omitted, the AI generates a first message. */
  reportMessage?: string;

  /** Structured data about the lead (audit results, FB form answers, etc.) */
  auditData?: {
    source?: string;
    siteUrl?: string;
    overallScore?: number;
    categories?: Record<string, number | string>;
    keyFindings?: string[];
    recommendations?: string[];
    businessType?: string;
    website?: string;
    formAnswers?: Record<string, string>;
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
      if (!request.body || typeof request.body !== 'object') {
        return reply.code(400).send({ error: 'Missing request body' });
      }

      const { phone, name, reportMessage, auditData, tenantId, instanceName } = request.body;

      if (!phone) {
        return reply.code(400).send({
          error: 'Missing required field: phone',
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
          id: crypto.randomUUID(),
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
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          contactId: contact.id,
          status: 'active',
          context: {
            state: 'qualifying' as const,
            extractedData: {
              source: auditData?.source || 'audit_tool',
              ...(auditData?.siteUrl ? { siteUrl: auditData.siteUrl } : {}),
              ...(auditData?.overallScore != null ? { auditScore: auditData.overallScore } : {}),
              ...(auditData?.keyFindings ? { auditFindings: auditData.keyFindings } : {}),
              ...(auditData?.recommendations ? { auditRecommendations: auditData.recommendations } : {}),
              ...(auditData?.businessType ? { businessType: auditData.businessType } : {}),
              ...(auditData?.website ? { website: auditData.website } : {}),
              ...(auditData?.formAnswers ? { formAnswers: auditData.formAnswers } : {}),
            },
            qualificationComplete: false,
            messageCount: 0,
            auditReportSent: !!reportMessage,
          },
        },
      });

      // Determine the message to send — use provided reportMessage or generate with AI
      let messageToSend = reportMessage;

      if (!messageToSend) {
        messageToSend = await generateFirstMessage(tenant, name ?? null, auditData ?? {});
      }

      // Send the first message via WhatsApp
      await sendMessage({
        tenantId: tenant.id,
        conversationId: conversation.id,
        instanceName: tenant.evolutionInstanceId,
        phone: normalizedPhone,
        text: messageToSend,
      });

      logger.info(
        {
          phone: normalizedPhone,
          tenant: tenant.businessName,
          conversationId: conversation.id,
          aiGenerated: !reportMessage,
        },
        'Lead first message sent and conversation created',
      );

      return reply.code(200).send({
        success: true,
        contactId: contact.id,
        conversationId: conversation.id,
        aiGenerated: !reportMessage,
        message: 'Lead first message sent. When the lead replies, the chatbot will continue the conversation.',
      });
    },
  );
}

/**
 * Generate a personalized first message using the tenant's AI provider.
 * Used when no reportMessage is provided (e.g. from Facebook lead ads).
 */
async function generateFirstMessage(
  tenant: any,
  leadName: string | null,
  leadData: Record<string, any>,
): Promise<string> {
  const fallback = `Olá${leadName ? ` ${leadName.split(' ')[0]}` : ''}! Aqui é a equipe da ${tenant.businessName}. Vi que você se interessou pelos nossos serviços — como podemos te ajudar?`;

  try {
    const aiConfig = tenant.aiConfig as Record<string, any>;
    const providerName: 'claude' | 'openai' = aiConfig.model ?? env.AI_PRIMARY_PROVIDER;
    const provider = getProvider(providerName);
    const model = getModelForTier(providerName, 'fast');

    const firstName = leadName ? leadName.split(' ')[0] : null;
    const source = leadData.source || 'formulário';
    const businessType = leadData.businessType || '';
    const website = leadData.website || '';
    const formAnswers = leadData.formAnswers || {};

    // Build context about the lead's form answers
    const answerEntries = Object.entries(formAnswers).filter(([, v]) => v);
    let formContext = '';
    if (answerEntries.length > 0) {
      formContext = '\n\nRespostas do formulário do lead:\n' +
        answerEntries.map(([k, v]) => `- ${String(k).replace(/_/g, ' ')}: ${v}`).join('\n');
    }

    const prompt = `Gere a PRIMEIRA mensagem de WhatsApp para um novo lead que acabou de preencher um formulário de ${source}.

Informações do lead:
- Nome: ${leadName || 'não informado'}
- Tipo de negócio: ${businessType || 'não informado'}
- Website: ${website || 'não informado'}${formContext}

Regras:
1. ${firstName ? `Cumprimente "${firstName}" pelo nome` : 'Cumprimente de forma calorosa'}
2. Mencione que você é da ${tenant.businessName}
3. Faça referência ao interesse/dados do lead de forma natural
4. Termine com UMA pergunta de qualificação relevante
5. Máximo 4-5 linhas, tom acolhedor e profissional
6. Retorne APENAS o texto da mensagem, sem JSON, sem aspas, sem formatação extra`;

    const response = await provider.chat({
      systemPrompt: `Você é o assistente virtual da ${tenant.businessName}. Escreva mensagens curtas e profissionais em português brasileiro para WhatsApp.`,
      messages: [{ role: 'user', content: prompt }],
      model,
      temperature: 0.7,
      maxTokens: 300,
    });

    // Clean up the response — strip any accidental JSON wrapping or quotes
    let text = response.text.trim();
    // If AI returned JSON despite instructions, extract replyText
    if (text.startsWith('{') || text.startsWith('```')) {
      try {
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
        const parsed = JSON.parse(jsonMatch[1] || text);
        text = parsed.replyText || parsed.text || parsed.message || text;
      } catch {
        // Not JSON, use as-is
      }
    }
    // Strip wrapping quotes
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      text = text.slice(1, -1);
    }

    return text || fallback;
  } catch (err) {
    logger.error({ err }, 'Failed to generate AI first message, using fallback');
    return fallback;
  }
}
