import crypto from 'crypto';
import { prisma } from '../../config/database';
import { twilioClient } from '../sms/twilio.client';
import { evolutionClient } from './evolution.client';
import { logger } from '../../utils/logger';

interface SendMessageOptions {
  tenantId: string;
  conversationId: string;
  instanceName?: string;   // Evolution instance — only for webchat channel
  phone: string;
  text: string;
  channel?: string;        // 'sms' (default) | 'web'
  delay?: number;
}

/**
 * Channel-aware message sender.
 * - SMS channel (default): uses Twilio REST API
 * - Web channel: uses Evolution API (webchat widget backend)
 */
export async function sendMessage(options: SendMessageOptions): Promise<void> {
  const { tenantId, conversationId, phone, text, channel = 'sms' } = options;

  let externalMessageId: string | null = null;

  try {
    if (channel === 'web' && options.instanceName) {
      // Webchat: use Evolution API
      const result = await evolutionClient.sendText(options.instanceName, {
        number: phone,
        text,
        delay: options.delay ?? randomDelay(),
      });
      externalMessageId = result?.key?.id ?? null;
    } else {
      // SMS: use Twilio
      const result = await twilioClient.sendText(phone, text);
      externalMessageId = result?.sid ?? null;
    }

    await prisma.message.create({
      data: {
        id: crypto.randomUUID(),
        conversationId,
        tenantId,
        direction: 'outbound',
        messageType: 'text',
        content: text,
        externalMessageId,
        status: 'sent',
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
  } catch (err: any) {
    const detail = err?.response?.data ?? err?.message ?? err;
    logger.error({ detail, phone, channel, tenantId }, 'Failed to send message');
    throw err;
  }
}

function randomDelay(): number {
  return Math.floor(Math.random() * 2000) + 1000;
}
