import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { fromWhatsAppJid } from '../../utils/phone.utils';
import { messageQueue } from '../../jobs/queue.setup';

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

async function handleIncomingMessage(instanceName: string, data: MessageData): Promise<void> {
  // Ignore outgoing messages
  if (data.key.fromMe) return;

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

  // Find or create active conversation
  let conversation = await prisma.conversation.findFirst({
    where: { tenantId: tenant.id, contactId: contact.id, status: 'active' },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        status: 'active',
      },
    });
  }

  // Store inbound message
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

  // Queue for AI processing (Phase 2 will implement the processor)
  await messageQueue.add('process-message', {
    tenantId: tenant.id,
    contactId: contact.id,
    conversationId: conversation.id,
    phone,
    text,
    messageType,
    senderName,
  });

  logger.info(
    { tenant: tenant.businessName, phone, messageType },
    'Inbound message queued for processing',
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
