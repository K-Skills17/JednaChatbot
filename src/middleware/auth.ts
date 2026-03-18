import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { authService } from '../modules/auth/auth.service';

declare module 'fastify' {
  interface FastifyRequest {
    authenticatedTenantId?: string;
  }
}

/**
 * Validate authentication via API key or JWT Bearer token.
 *
 * Supports three modes (tried in order):
 *  1. JWT Bearer token — validates token and attaches tenantId from payload.
 *  2. Per-tenant API key — looks up the tenant by apiKey.
 *  3. Global API key — falls back to env.API_KEY for admin access.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // 1. Try JWT Bearer token
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = authService.verifyToken(token);
      request.authenticatedTenantId = payload.tenantId;
      (request as any).jwtUser = payload;
      return;
    } catch {
      // Invalid JWT — fall through to API key check
    }
  }

  // 2. Try API key
  const apiKey = request.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Missing API key or Bearer token' });
  }

  // 2a. Per-tenant key lookup
  const tenant = await prisma.tenant.findUnique({ where: { apiKey } });
  if (tenant) {
    request.authenticatedTenantId = tenant.id;
    return;
  }

  // 2b. Global key
  if (apiKey === env.API_KEY) {
    return; // global admin access
  }

  return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid API key or token' });
}
