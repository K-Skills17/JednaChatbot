import { prisma } from '../../config/database';
import { evolutionClient } from './evolution.client';
import { logger } from '../../utils/logger';

interface SendMessageOptions {
  tenantId: string;
  conversationId: string;
  instanceName: string;
  phone: string;
  text: string;
  delay?: number;
}

/** Send an outbound message and persist it */
export async function sendMessage(options: SendMessageOptions): Promise<void> {
  const { tenantId, conversationId, instanceName, phone, text, delay } = options;

  try {
    const result = await evolutionClient.sendText(instanceName, {
      number: phone,
      text,
      delay: delay ?? randomDelay(),
    });

    await prisma.message.create({
      data: {
        conversationId,
        tenantId,
        direction: 'outbound',
        messageType: 'text',
        content: text,
        whatsappMessageId: result?.key?.id ?? null,
        status: 'sent',
      },
    });

    // Update conversation last message timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
  } catch (err) {
    logger.error({ err, phone, tenantId }, 'Failed to send message');
    throw err;
  }
}

/** Random delay between 1-3 seconds to feel human */
function randomDelay(): number {
  return Math.floor(Math.random() * 2000) + 1000;
}
