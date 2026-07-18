/**
 * Twilio SMS webhook handler.
 * Registered at POST /webhook/sms
 *
 * Twilio sends x-www-form-urlencoded bodies. Key fields:
 *   From       — sender E.164 number
 *   To         — our Twilio number
 *   Body       — message text
 *   MessageSid — unique message ID
 *   AccountSid — Twilio account (validates belongs to us)
 *
 * STOP/HELP are handled HERE at the transport layer before any AI processing.
 * Twilio also handles STOP automatically at carrier level, but we mirror it in our DB.
 */

import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { getMessageQueue } from '../../jobs/queue.setup';
import { normalizeUsPhone } from './twilio.client';

interface TwilioSmsPayload {
  From: string;
  To: string;
  Body: string;
  MessageSid: string;
  AccountSid: string;
  NumMedia?: string;
}

const STOP_KEYWORDS = new Set(['stop', 'unsubscribe', 'cancel', 'quit', 'end']);
const HELP_KEYWORDS = new Set(['help', 'info']);

export function registerSmsWebhookRoutes(app: FastifyInstance): void {
  // Twilio sends form-encoded data — register content-type parser
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => {
    try {
      const parsed = Object.fromEntries(new URLSearchParams(body as string));
      done(null, parsed);
    } catch (err: any) {
      done(err);
    }
  });

  app.post(
    '/webhook/sms',
    async (request: FastifyRequest<{ Body: TwilioSmsPayload }>, reply: FastifyReply) => {
      const body = request.body;

      if (!body?.From || !body?.Body) {
        return reply.code(400).send({ error: 'Missing From or Body' });
      }

      const phone = normalizeUsPhone(body.From);
      const text = (body.Body ?? '').trim();
      const messageSid = body.MessageSid;

      logger.debug({ phone, chars: text.length, sid: messageSid }, 'Inbound SMS received');

      // ── STOP handling (transport level — before any AI) ──────────────
      const normalized = text.toLowerCase().trim();

      if (STOP_KEYWORDS.has(normalized) || normalized.startsWith('stop ')) {
        await handleStop(phone, reply);
        return;
      }

      // ── HELP handling ────────────────────────────────────────────────
      if (HELP_KEYWORDS.has(normalized)) {
        await handleHelp(phone, reply);
        return;
      }

      // ── Normal message — route to AI queue ──────────────────────────
      await handleInboundSms(phone, text, messageSid, reply);
    },
  );
}

/**
 * Handle STOP keyword: opt out the contact in DB and reply with carrier-mandated message.
 * Carrier also handles STOP automatically, but we must mirror it.
 */
async function handleStop(phone: string, reply: FastifyReply): Promise<void> {
  try {
    // Find the contact across all tenants (SMS number is globally unique)
    const contacts = await prisma.contact.findMany({ where: { phone } });

    for (const contact of contacts) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { optedOut: true, optedOutAt: new Date() },
      });

      // Close active conversations
      await prisma.conversation.updateMany({
        where: { contactId: contact.id, status: 'active' },
        data: { status: 'closed', closedAt: new Date() },
      });
    }

    logger.info({ phone }, 'Contact opted out via STOP');
  } catch (err) {
    logger.error({ err, phone }, 'Failed to process STOP opt-out in DB');
  }

  // Carrier-required STOP confirmation (verbatim per CTIA guidelines)
  return sendTwimlReply(
    reply,
    'You have been unsubscribed and will not receive any more messages. Reply START to re-subscribe anytime.',
  );
}

/**
 * Handle HELP keyword: reply with program info and opt-out instruction.
 */
async function handleHelp(phone: string, reply: FastifyReply): Promise<void> {
  logger.info({ phone }, 'HELP request received');

  // CTIA-required HELP response
  return sendTwimlReply(
    reply,
    'Jedna Marketing patient outreach. Msg&data rates may apply. Reply STOP to unsubscribe. For help call {{PRACTICE_PHONE}} or visit {{PRACTICE_URL}}.',
  );
}

/**
 * Handle a normal inbound SMS: find/create contact+conversation, queue for AI.
 */
async function handleInboundSms(
  phone: string,
  text: string,
  messageSid: string,
  reply: FastifyReply,
): Promise<void> {
  // Find the tenant that owns this SMS number (or first active tenant as fallback)
  let tenant = await prisma.tenant.findFirst({
    where: { smsNumber: env.TWILIO_FROM_NUMBER ?? '', status: 'active' },
  });

  if (!tenant) {
    // Fallback: single-tenant setups
    tenant = await prisma.tenant.findFirst({ where: { status: 'active' } });
  }

  if (!tenant) {
    logger.warn({ phone }, 'No active tenant found for inbound SMS');
    return sendTwimlReply(reply, '');
  }

  // Check if opted out
  const existingContact = await prisma.contact.findFirst({
    where: { tenantId: tenant.id, phone },
    select: { optedOut: true },
  });

  if (existingContact?.optedOut) {
    logger.info({ phone }, 'Message from opted-out contact — ignoring');
    return sendTwimlReply(reply, '');
  }

  // Upsert contact
  const contact = await prisma.contact.upsert({
    where: { tenantId_phone: { tenantId: tenant.id, phone } },
    update: { lastContactAt: new Date() },
    create: {
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      phone,
      channel: 'sms',
      leadStatus: 'new',
    },
  });

  // Track campaign replies
  await trackCampaignReply(tenant.id, contact.id);

  // Find or create active conversation
  let conversation = await prisma.conversation.findFirst({
    where: { tenantId: tenant.id, contactId: contact.id, status: 'active' },
  });

  if (!conversation) {
    // Reopen recently-closed conversation (within 24 hours)
    const recentClosed = await prisma.conversation.findFirst({
      where: { tenantId: tenant.id, contactId: contact.id, status: 'closed' },
      orderBy: { closedAt: 'desc' },
    });

    const isRecent = recentClosed?.closedAt &&
      Date.now() - recentClosed.closedAt.getTime() < 24 * 60 * 60 * 1000;

    if (recentClosed && isRecent) {
      conversation = await prisma.conversation.update({
        where: { id: recentClosed.id },
        data: { status: 'active', closedAt: null },
      });
    } else {
      conversation = await prisma.conversation.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          contactId: contact.id,
          channel: 'sms',
          status: 'active',
          context: {
            state: 'greeting',
            extractedData: {},
            qualificationComplete: false,
            messageCount: 0,
          },
        },
      });
    }
  }

  // Deduplicate by MessageSid
  try {
    await prisma.message.create({
      data: {
        id: crypto.randomUUID(),
        conversationId: conversation.id,
        tenantId: tenant.id,
        direction: 'inbound',
        messageType: 'text',
        content: text,
        externalMessageId: messageSid,
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      logger.debug({ messageSid }, 'Duplicate SMS ignored');
      return sendTwimlReply(reply, '');
    }
    throw err;
  }

  // Log inbound event
  try {
    await prisma.event.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        leadId: contact.id,
        type: 'message_in',
        payload: { phone, channel: 'sms' },
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to log inbound event');
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  // Queue for AI processing with debounce
  const debounceJobId = `turn-${conversation.id}`;
  const existingJob = await getMessageQueue().getJob(debounceJobId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (state === 'delayed' || state === 'waiting') await existingJob.remove();
  }

  await getMessageQueue().add('process-message', {
    tenantId: tenant.id,
    contactId: contact.id,
    conversationId: conversation.id,
    phone,
    text,
    messageType: 'text',
    senderName: null,
    channel: 'sms',
  }, {
    jobId: debounceJobId,
    delay: env.DEBOUNCE_MS,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: 100,
  });

  logger.info({ tenant: tenant.businessName, phone }, 'Inbound SMS queued for AI processing');

  // Return empty TwiML — AI will send reply asynchronously via Twilio REST API
  return sendTwimlReply(reply, '');
}

/** Reply with TwiML. Empty body = no immediate response (AI replies async). */
function sendTwimlReply(reply: FastifyReply, message: string): void {
  const bodyTag = message
    ? `<Message>${escapeXml(message)}</Message>`
    : '';

  reply
    .code(200)
    .header('Content-Type', 'text/xml')
    .send(`<?xml version="1.0" encoding="UTF-8"?><Response>${bodyTag}</Response>`);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function trackCampaignReply(tenantId: string, contactId: string): Promise<void> {
  try {
    const campaignContacts = await prisma.campaignContact.findMany({
      where: {
        contactId,
        status: 'sent',
        campaign: { tenantId, status: { in: ['active', 'completed'] } },
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
    }
  } catch (err) {
    logger.error({ err, contactId }, 'Failed to track campaign reply');
  }
}
