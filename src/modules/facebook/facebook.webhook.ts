import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { getFacebookLeadQueue } from '../../jobs/queue.setup';
import { prisma } from '../../config/database';
import { sendMessage } from '../whatsapp/message.sender';
import { normalizeBrazilianPhone, cleanPhone } from '../../utils/phone.utils';
import { calculateFormLeadScore, buildScoredFirstMessage } from './form-lead-scoring';
import { debugFacebookLead } from './facebook.lead.processor';

/**
 * Facebook Lead Ads Webhook Handler
 *
 * Flow:
 * 1. Facebook sends a GET request for webhook verification (hub.challenge)
 * 2. Facebook sends POST with leadgen events when someone fills out a Lead Ad form
 * 3. We enqueue a job to fetch lead details from Graph API and send the first WhatsApp message
 */

export function registerFacebookWebhookRoutes(app: FastifyInstance): void {
  // ─── Webhook Verification (GET) ──────────────────────────────
  // Facebook sends this when you first register the webhook URL
  app.get('/webhook/facebook', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === env.FACEBOOK_VERIFY_TOKEN) {
      logger.info('Facebook webhook verified successfully');
      return reply.code(200).type('text/plain').send(challenge);
    }

    logger.warn({ mode, token }, 'Facebook webhook verification failed');
    return reply.code(403).send({ error: 'Verification failed' });
  });

  // ─── Leadgen Event Receiver (POST) ───────────────────────────
  app.post('/webhook/facebook', async (request: FastifyRequest, reply: FastifyReply) => {
    // Verify signature if app secret is configured
    if (env.FACEBOOK_APP_SECRET) {
      const signature = request.headers['x-hub-signature-256'] as string | undefined;
      const rawBody = JSON.stringify(request.body);
      if (!verifyFacebookSignature(rawBody, signature)) {
        logger.warn('Invalid Facebook webhook signature');
        return reply.code(401).send({ error: 'Invalid signature' });
      }
    }

    const body = request.body as FacebookWebhookPayload;

    // Facebook requires a 200 response quickly, or it retries
    if (body.object !== 'page') {
      return reply.code(200).send({ received: true });
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field === 'leadgen') {
          const leadData = change.value as LeadgenValue;

          logger.info(
            { pageId: leadData.page_id, leadgenId: leadData.leadgen_id, formId: leadData.form_id },
            'Facebook lead received',
          );

          // Enqueue for async processing (fetching lead details + sending first message)
          await getFacebookLeadQueue().add(
            'process-facebook-lead',
            {
              leadgenId: leadData.leadgen_id,
              pageId: leadData.page_id,
              formId: leadData.form_id,
              adId: leadData.ad_id,
              createdTime: leadData.created_time,
            },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 3000 },
            },
          );
        }
      }
    }

    return reply.code(200).send({ received: true });
  });

  // ─── Test Endpoint — Simulate Facebook Lead (bypasses Graph API) ──
  // POST /webhook/facebook/test
  // Use this to verify the full pipeline: scoring → message → WhatsApp send
  // Protected by API_KEY so it can't be hit by the public
  app.post('/webhook/facebook/test', async (request: FastifyRequest, reply: FastifyReply) => {
    // Require API key
    const apiKey = request.headers['x-api-key'] as string | undefined;
    if (apiKey !== env.API_KEY) {
      return reply.code(401).send({ error: 'Invalid API key' });
    }

    const body = request.body as TestFacebookLeadPayload;

    if (!body.phone) {
      return reply.code(400).send({ error: 'Missing required field: phone' });
    }

    // Defaults for testing
    const name = body.name ?? 'Lead Teste';
    const phone = normalizeBrazilianPhone(body.phone) ?? cleanPhone(body.phone);
    const noShows = body.faltas_por_mes ?? 'Entre 5 e 15';
    const ticket = body.ticket_medio ?? 'R$300–500';
    const clinicName = body.nome_da_clinica ?? null;
    const dryRun = body.dry_run ?? false;

    // 1. Calculate score
    const formScoring = calculateFormLeadScore(noShows, ticket);

    if (!formScoring) {
      return reply.code(400).send({
        error: 'Could not calculate score — check dropdown values',
        hint: {
          faltas_por_mes: ['Menos de 5', 'Entre 5 e 15', 'Entre 15 e 30', 'Mais de 30'],
          ticket_medio: ['Até R$150', 'R$150–300', 'R$300–500', 'R$500–800', 'Acima de R$800'],
        },
        received: { faltas_por_mes: noShows, ticket_medio: ticket },
      });
    }

    // 2. Build the message that would be sent
    const firstMessage = buildScoredFirstMessage(name, clinicName, formScoring);

    // If dry_run, return everything without actually sending or creating records
    if (dryRun) {
      return reply.send({
        dry_run: true,
        scoring: {
          noShowsPerMonth: formScoring.noShowsPerMonth,
          averageTicket: formScoring.averageTicket,
          monthlyLoss: formScoring.monthlyLoss,
          annualLoss: formScoring.annualLoss,
          leadScore: formScoring.leadScore,
          tier: formScoring.tier,
          signalLevel: formScoring.signalLevel,
          icpSignal: formScoring.icpSignal,
          priority: formScoring.priority,
        },
        message_preview: firstMessage,
        would_send_to: phone,
      });
    }

    // 3. Find tenant
    const tenant = await prisma.tenant.findFirst({ where: { status: 'active' } });
    if (!tenant || !tenant.evolutionInstanceId) {
      return reply.code(404).send({ error: 'No active tenant with WhatsApp instance found' });
    }

    // 4. Upsert contact
    const qualificationData = {
      source: 'facebook_lead_ad',
      formId: 'test-form',
      adId: null,
      rawFields: { faltas_por_mes: noShows, ticket_medio: ticket, nome_da_clinica: clinicName },
      formScoring: {
        noShowsPerMonth: formScoring.noShowsPerMonth,
        averageTicket: formScoring.averageTicket,
        monthlyLoss: formScoring.monthlyLoss,
        annualLoss: formScoring.annualLoss,
        signalLevel: formScoring.signalLevel,
        icpSignal: formScoring.icpSignal,
        priority: formScoring.priority,
        tier: formScoring.tier,
      },
    };

    const contact = await prisma.contact.upsert({
      where: { tenantId_phone: { tenantId: tenant.id, phone } },
      update: {
        lastContactAt: new Date(),
        name,
        leadScore: formScoring.leadScore,
        qualificationData,
      },
      create: {
        tenantId: tenant.id,
        phone,
        name,
        leadStatus: formScoring.tier === 'nurture' ? 'new' : 'qualifying',
        leadScore: formScoring.leadScore,
        tags: ['facebook-lead', 'test'],
        qualificationData,
      },
    });

    // 5. Close any existing active conversation
    await prisma.conversation.updateMany({
      where: { tenantId: tenant.id, contactId: contact.id, status: 'active' },
      data: { status: 'closed', closedAt: new Date() },
    });

    // 6. Create conversation
    const conversation = await prisma.conversation.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        status: 'active',
        context: {
          state: 'greeting',
          extractedData: {
            nome: name,
            source: 'facebook_lead_ad',
            formScoring: {
              noShowsPerMonth: formScoring.noShowsPerMonth,
              averageTicket: formScoring.averageTicket,
              monthlyLoss: formScoring.monthlyLoss,
              annualLoss: formScoring.annualLoss,
              tier: formScoring.tier,
              priority: formScoring.priority,
            },
            faltas_por_mes: noShows,
            ticket_medio: ticket,
          },
          qualificationComplete: false,
          messageCount: 0,
        },
      },
    });

    // 7. Send via WhatsApp
    await sendMessage({
      tenantId: tenant.id,
      conversationId: conversation.id,
      instanceName: tenant.evolutionInstanceId,
      phone,
      text: firstMessage,
    });

    logger.info(
      { phone, tier: formScoring.tier, leadScore: formScoring.leadScore, monthlyLoss: formScoring.monthlyLoss },
      'Test Facebook lead processed successfully',
    );

    return reply.send({
      success: true,
      contactId: contact.id,
      conversationId: conversation.id,
      scoring: {
        noShowsPerMonth: formScoring.noShowsPerMonth,
        averageTicket: formScoring.averageTicket,
        monthlyLoss: formScoring.monthlyLoss,
        annualLoss: formScoring.annualLoss,
        leadScore: formScoring.leadScore,
        tier: formScoring.tier,
        priority: formScoring.priority,
      },
      message_sent: firstMessage,
    });
  });
  // ─── Debug Endpoint — Re-fetch lead and show raw fields + scoring ──
  // GET /webhook/facebook/debug/:leadgenId
  app.get('/webhook/facebook/debug/:leadgenId', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const apiKey = (request.headers['x-api-key'] as string | undefined) ?? query.key;
    if (apiKey !== env.API_KEY) {
      logger.warn({ receivedKeyLength: apiKey?.length, expectedKeyLength: env.API_KEY?.length }, 'Debug endpoint: API key mismatch');
      return reply.code(401).send({ error: 'Invalid API key', hint: `Received key length: ${apiKey?.length ?? 0}, expected length: ${env.API_KEY?.length ?? 0}` });
    }

    const { leadgenId } = request.params as { leadgenId: string };
    const result = await debugFacebookLead(leadgenId);
    return reply.send(result);
  });
}

interface TestFacebookLeadPayload {
  phone: string;
  name?: string;
  faltas_por_mes?: string;
  ticket_medio?: string;
  nome_da_clinica?: string;
  /** If true, only calculates and returns the score + message preview without sending */
  dry_run?: boolean;
}

// ── Signature Verification ──────────────────────────────────────

function verifyFacebookSignature(
  rawBody: string | undefined,
  signature: string | undefined,
): boolean {
  if (!signature || !rawBody || !env.FACEBOOK_APP_SECRET) return false;

  const expectedSignature = 'sha256=' +
    crypto.createHmac('sha256', env.FACEBOOK_APP_SECRET)
      .update(rawBody)
      .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  } catch {
    return false;
  }
}

// ── Types ───────────────────────────────────────────────────────

interface FacebookWebhookPayload {
  object: string;
  entry?: Array<{
    id: string;
    time: number;
    changes?: Array<{
      field: string;
      value: any;
    }>;
  }>;
}

interface LeadgenValue {
  leadgen_id: string;
  page_id: string;
  form_id: string;
  ad_id?: string;
  created_time: number;
}
