import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { getFacebookLeadQueue } from '../../jobs/queue.setup';

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
