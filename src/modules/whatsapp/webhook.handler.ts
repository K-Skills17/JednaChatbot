import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { fromWhatsAppJid } from '../../utils/phone.utils';
import { getMessageQueue } from '../../jobs/queue.setup';
import { webhookAuthMiddleware } from '../../middleware/webhook-auth';

/**
 * Evolution API webhook payload types.
 * These arrive at POST /webhook/evolution
 */
interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: any;
}

interface MessageData {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text: string };
    imageMessage?: any;
    audioMessage?: any;
    documentMessage?: any;
    buttonsResponseMessage?: { selectedButtonId: string };
    listResponseMessage?: { singleSelectReply: { selectedRowId: string } };
  };
  messageType?: string;
  messageTimestamp?: number;
}

export function registerWebhookRoutes(app: FastifyInstance): void {
  app.addHook('preHandler', webhookAuthMiddleware);

  app.post(
    '/webhook/evolution',
    async (request: FastifyRequest<{ Body: EvolutionWebhookPayload }>, reply: FastifyReply) => {
      const { event, instance, data } = request.body;

      logger.debug({ event, instance }, 'Webhook received');

      switch (event) {
        case 'messages.upsert':
          await handleIncomingMessage(instance, data);
          break;

        case 'messages.update':
          await handleMessageStatusUpdate(instance, data);
          break;

        case 'connection.update':
          await handleConnectionUpdate(instance, data);
          break;

        case 'qrcode.updated':
          logger.info({ instance }, 'QR code updated — scan to connect');
          break;

        default:
          logger.debug({ event }, 'Unhandled webhook event');
      }

      reply.code(200).send({ received: true });
    },
  );
}

/** Duration (ms) to pause AI after a human operator sends a message */
const HUMAN_TAKEOVER_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

async function handleIncomingMessage(instanceName: string, data: MessageData): Promise<void> {
  // Detect human operator messages (sent from the WhatsApp app, not the bot)
  // Ignore group messages — only process private (1-to-1) chats
  if (data.key.remoteJid.endsWith('@g.us')) {
    logger.debug({ remoteJid: data.key.remoteJid }, 'Group message ignored');
    return;
  }

  if (data.key.fromMe) {
    await handleHumanOperatorMessage(instanceName, data);
    return;
  }

  const phone = fromWhatsAppJid(data.key.remoteJid);
  const text = extractTextContent(data);
  const messageType = detectMessageType(data);
  const senderName = data.pushName ?? null;

  // Find the tenant by Evolution instance
  const tenant = await prisma.tenant.findFirst({
    where: { evolutionInstanceId: instanceName, status: 'active' },
  });

  if (!tenant) {
    logger.warn({ instanceName }, 'Received message for unknown/inactive tenant');
    return;
  }

  // Upsert contact
  const contact = await prisma.contact.upsert({
    where: { tenantId_phone: { tenantId: tenant.id, phone } },
    update: { lastContactAt: new Date(), name: senderName ?? undefined },
    create: {
      tenantId: tenant.id,
      phone,
      name: senderName,
      leadStatus: 'new',
    },
  });

  // Track campaign replies (non-blocking)
  await trackCampaignReply(tenant.id, contact.id);

  // Find or create active conversation
  let conversation = await prisma.conversation.findFirst({
    where: { tenantId: tenant.id, contactId: contact.id, status: 'active' },
  });

  if (!conversation) {
    // Check for a recently closed conversation to reopen
    const recentClosed = await prisma.conversation.findFirst({
      where: { tenantId: tenant.id, contactId: contact.id, status: 'closed' },
      orderBy: { closedAt: 'desc' },
    });

    const isRecent = recentClosed?.closedAt &&
      Date.now() - recentClosed.closedAt.getTime() < 24 * 60 * 60 * 1000; // within 24h

    if (recentClosed && isRecent) {
      // Reopen the recently closed conversation
      conversation = await prisma.conversation.update({
        where: { id: recentClosed.id },
        data: { status: 'active', closedAt: null },
      });
    } else {
      // Determine initial state: skip greeting if the contact already has context
      // (e.g. audit tool already sent them a report and set leadStatus to 'qualifying')
      const hasAuditData = contact.qualificationData &&
        typeof contact.qualificationData === 'object' &&
        (contact.qualificationData as Record<string, any>).audit;

      const initialState = contact.leadStatus === 'new' ? 'greeting' : 'qualifying';
      const initialExtractedData = hasAuditData
        ? {
            source: 'audit_tool',
            ...((contact.qualificationData as Record<string, any>).audit ?? {}),
          }
        : {};

      // Create a new conversation with proper initial context
      conversation = await prisma.conversation.create({
        data: {
          tenantId: tenant.id,
          contactId: contact.id,
          status: 'active',
          context: {
            state: initialState,
            extractedData: initialExtractedData,
            qualificationComplete: false,
            messageCount: 0,
            ...(hasAuditData ? { auditReportSent: true } : {}),
          },
        },
      });
    }
  }

  // Store inbound message (deduplicate by whatsappMessageId)
  const existingMessage = await prisma.message.findFirst({
    where: { whatsappMessageId: data.key.id },
    select: { id: true },
  });

  if (existingMessage) {
    logger.debug({ whatsappMessageId: data.key.id }, 'Duplicate message ignored');
    return;
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      tenantId: tenant.id,
      direction: 'inbound',
      messageType,
      content: text,
      whatsappMessageId: data.key.id,
    },
  });

  // Update conversation timestamp
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  // Queue for AI processing with retry config
  await getMessageQueue().add('process-message', {
    tenantId: tenant.id,
    contactId: contact.id,
    conversationId: conversation.id,
    phone,
    text,
    messageType,
    senderName,
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });

  logger.info(
    { tenant: tenant.businessName, phone, messageType },
    'Inbound message queued for processing',
  );
}

/**
 * When a human operator sends a message from the WhatsApp app (fromMe: true),
 * pause the AI bot for that conversation for HUMAN_TAKEOVER_DURATION_MS.
 * This prevents the bot from responding while a human is actively handling the chat.
 */
async function handleHumanOperatorMessage(instanceName: string, data: MessageData): Promise<void> {
  const phone = fromWhatsAppJid(data.key.remoteJid);
  const text = extractTextContent(data);

  const tenant = await prisma.tenant.findFirst({
    where: { evolutionInstanceId: instanceName, status: 'active' },
  });
  if (!tenant) return;

  const contact = await prisma.contact.findFirst({
    where: { tenantId: tenant.id, phone },
  });
  if (!contact) return;

  const conversation = await prisma.conversation.findFirst({
    where: { tenantId: tenant.id, contactId: contact.id, status: 'active' },
  });
  if (!conversation) return;

  // Set the human takeover timestamp in conversation context
  const context = (conversation.context as Record<string, any>) ?? {};
  const humanTakeoverUntil = new Date(Date.now() + HUMAN_TAKEOVER_DURATION_MS).toISOString();

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      context: { ...context, humanTakeoverUntil },
      lastMessageAt: new Date(),
    },
  });

  // Store the human message for conversation history
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      tenantId: tenant.id,
      direction: 'outbound',
      messageType: text ? 'text' : 'unknown',
      content: text,
      whatsappMessageId: data.key.id,
      status: 'sent',
    },
  });

  logger.info(
    { tenant: tenant.businessName, phone, humanTakeoverUntil },
    'Human operator took over — AI paused for 2 hours',
  );
}

async function handleMessageStatusUpdate(instanceName: string, data: any): Promise<void> {
  // Update message delivery/read status
  if (data?.key?.id && data?.status) {
    const statusMap: Record<number, string> = {
      2: 'sent',
      3: 'delivered',
      4: 'read',
      5: 'read',
    };

    const newStatus = statusMap[data.status];
    if (!newStatus) return;

    await prisma.message.updateMany({
      where: { whatsappMessageId: data.key.id },
      data: { status: newStatus },
    });
  }
}

async function handleConnectionUpdate(instanceName: string, data: any): Promise<void> {
  const state = data?.state ?? data?.connection;
  logger.info({ instanceName, state }, 'Connection state changed');

  if (state === 'close' || state === 'disconnected') {
    logger.warn({ instanceName }, 'WhatsApp disconnected — may need reconnection');
  }
}

function extractTextContent(data: MessageData): string | null {
  if (!data.message) return null;

  if (data.message.conversation) return data.message.conversation;
  if (data.message.extendedTextMessage?.text) return data.message.extendedTextMessage.text;
  if (data.message.buttonsResponseMessage?.selectedButtonId)
    return data.message.buttonsResponseMessage.selectedButtonId;
  if (data.message.listResponseMessage?.singleSelectReply?.selectedRowId)
    return data.message.listResponseMessage.singleSelectReply.selectedRowId;

  return null; // media without text
}

async function trackCampaignReply(tenantId: string, contactId: string): Promise<void> {
  try {
    const campaignContacts = await prisma.campaignContact.findMany({
      where: {
        contactId,
        status: 'sent',
        campaign: {
          tenantId,
          status: { in: ['active', 'completed'] },
        },
      },
    });

    for (const cc of campaignContacts) {
      await prisma.campaignContact.update({
        where: { id: cc.id },
        data: { status: 'replied', repliedAt: new Date() },
      });

      await prisma.campaign.update({
        where: { id: cc.campaignId },
        data: { replyCount: { increment: 1 } },
      });

      logger.info({ campaignId: cc.campaignId, contactId }, 'Campaign reply tracked');
    }
  } catch (err) {
    logger.error({ err, contactId }, 'Failed to track campaign reply');
  }
}

function detectMessageType(data: MessageData): string {
  if (!data.message) return 'unknown';
  if (data.message.conversation || data.message.extendedTextMessage) return 'text';
  if (data.message.imageMessage) return 'image';
  if (data.message.audioMessage) return 'audio';
  if (data.message.documentMessage) return 'document';
  if (data.message.buttonsResponseMessage) return 'interactive';
  if (data.message.listResponseMessage) return 'interactive';
  return 'unknown';
}
