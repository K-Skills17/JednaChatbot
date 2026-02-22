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
  if (signature && env.EVOLUTION_API_KEY) {
    try {
      const rawBody = JSON.stringify(request.body);
      const expected = crypto
        .createHmac('sha256', env.EVOLUTION_API_KEY)
        .update(rawBody)
        .digest('hex');

      const sigBuf = Buffer.from(signature);
      const expectedBuf = Buffer.from(expected);

      // timingSafeEqual requires buffers of equal length — guard against crash
      if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return; // Authenticated
      }
    } catch {
      logger.warn('HMAC signature verification error');
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
  return reply.code(401).send({ error: 'Unauthorized webhook request' });
}
