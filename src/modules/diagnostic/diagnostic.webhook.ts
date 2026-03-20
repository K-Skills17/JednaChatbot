import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { normalizeBrazilianPhone } from '../../utils/phone.utils';
import { getDiagnosticQueue } from '../../jobs/queue.setup';

/**
 * Dentist Diagnostic Tool Webhook Handler
 *
 * Flow:
 * 1. Diagnostic tool sends POST /webhook/diagnostic with patient findings
 * 2. We verify HMAC-SHA256 signature (or API key in header)
 * 3. Enqueue a job to format results and send via WhatsApp
 */

export interface DiagnosticPayload {
  tenantId: string;
  patientPhone: string;
  patientName?: string;
  diagnostic: {
    type: string;
    summary: string;
    findings?: Array<{
      area: string;
      condition: string;
      severity?: string;
    }>;
    recommendedActions?: string[];
    urgency?: 'routine' | 'soon' | 'urgent';
    attachments?: Array<{
      type: string;
      url: string;
      description?: string;
    }>;
  };
  timestamp?: string;
}

export function registerDiagnosticWebhookRoutes(app: FastifyInstance): void {
  // Capture raw body for HMAC signature verification
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req: FastifyRequest, body: Buffer, done: (err: Error | null, body?: any) => void) => {
      try {
        (_req as any).rawBody = body;
        done(null, JSON.parse(body.toString()));
      } catch (err: any) {
        done(err);
      }
    },
  );

  app.post('/webhook/diagnostic', async (request: FastifyRequest, reply: FastifyReply) => {
    // ── Auth: HMAC signature or API key header ──
    if (!verifyDiagnosticAuth(request)) {
      logger.warn({ ip: request.ip }, 'Diagnostic webhook authentication failed');
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const body = request.body as DiagnosticPayload;

    // ── Validate required fields ──
    if (!body.tenantId || !body.patientPhone || !body.diagnostic?.summary) {
      return reply.code(400).send({
        error: 'Missing required fields',
        required: ['tenantId', 'patientPhone', 'diagnostic.summary'],
      });
    }

    // ── Normalize phone ──
    const phone = normalizeBrazilianPhone(body.patientPhone);
    if (!phone) {
      return reply.code(400).send({ error: 'Invalid phone number format' });
    }

    // ── Verify tenant exists and is active ──
    const tenant = await prisma.tenant.findUnique({ where: { id: body.tenantId } });
    if (!tenant || tenant.status !== 'active') {
      return reply.code(404).send({ error: 'Tenant not found or inactive' });
    }

    if (!tenant.evolutionInstanceId) {
      return reply.code(422).send({ error: 'Tenant has no WhatsApp instance configured' });
    }

    // ── Enqueue for async processing ──
    await getDiagnosticQueue().add(
      'process-diagnostic',
      {
        tenantId: body.tenantId,
        patientPhone: phone,
        patientName: body.patientName ?? null,
        diagnostic: body.diagnostic,
        timestamp: body.timestamp ?? new Date().toISOString(),
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    logger.info(
      { tenantId: body.tenantId, phone, type: body.diagnostic.type },
      'Diagnostic result enqueued',
    );

    return reply.code(202).send({ received: true, queued: true });
  });
}

// ── Authentication ──────────────────────────────────────────

function verifyDiagnosticAuth(request: FastifyRequest): boolean {
  // Strategy 1: x-api-key header matches tenant or global API key
  const apiKey = request.headers['x-api-key'] as string | undefined;
  if (apiKey && apiKey === env.API_KEY) {
    return true;
  }

  // Strategy 2: HMAC-SHA256 signature via x-diagnostic-signature header
  const secret = env.DIAGNOSTIC_WEBHOOK_SECRET;
  if (secret) {
    const signature = request.headers['x-diagnostic-signature'] as string | undefined;
    const rawBody = (request as any).rawBody as Buffer | undefined;

    if (signature && rawBody) {
      const expected = 'sha256=' +
        crypto.createHmac('sha256', secret)
          .update(rawBody)
          .digest('hex');

      try {
        return crypto.timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(expected),
        );
      } catch {
        return false;
      }
    }
  }

  // Strategy 3: Allow in development without auth
  if (env.NODE_ENV === 'development') {
    logger.warn('Diagnostic webhook received without authentication (dev mode)');
    return true;
  }

  return false;
}
