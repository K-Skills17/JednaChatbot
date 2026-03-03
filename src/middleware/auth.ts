import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env';
import { prisma } from '../config/database';

declare module 'fastify' {
  interface FastifyRequest {
    authenticatedTenantId?: string;
  }
}

/**
 * Validate API key in x-api-key header.
 *
 * Supports two modes:
 *  1. Per-tenant key — looks up the tenant by apiKey and attaches it to the request.
 *  2. Global key — falls back to env.API_KEY for backward compatibility.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Missing API key' });
  }

  // 1. Try per-tenant key lookup
  const tenant = await prisma.tenant.findUnique({ where: { apiKey } });
  if (tenant) {
    request.authenticatedTenantId = tenant.id;
    return;
  }

  // 2. Fall back to global key
  if (apiKey === env.API_KEY) {
    return; // global admin access
  }

  return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid API key' });
}
