import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Webhook authentication middleware.
 * Verifies that incoming Evolution API webhooks are authentic
 * by checking the API key header or HMAC signature.
 */
export async function webhookAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Strategy 1: Check apikey header (Evolution API sends this when configured)
  const apiKey = request.headers['apikey'] as string | undefined;
  if (apiKey && apiKey === env.EVOLUTION_API_KEY) {
    return; // Authenticated
  }

  // Strategy 2: HMAC signature verification (x-webhook-signature header)
  const signature = request.headers['x-webhook-signature'] as string | undefined;
  if (signature) {
    const rawBody = JSON.stringify(request.body);
    const expected = crypto
      .createHmac('sha256', env.EVOLUTION_API_KEY)
      .update(rawBody)
      .digest('hex');

    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return; // Authenticated
    }
  }

  // Strategy 3: Allow in development mode without auth (for local testing)
  if (env.NODE_ENV === 'development') {
    logger.warn('Webhook received without authentication (dev mode)');
    return;
  }

  logger.warn(
    { ip: request.ip, url: request.url },
    'Webhook authentication failed',
  );
  reply.code(401).send({ error: 'Unauthorized webhook request' });
}
