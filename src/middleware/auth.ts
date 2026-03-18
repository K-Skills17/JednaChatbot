import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { authService } from '../modules/auth/auth.service';
import { adminService } from '../modules/admin/admin.service';

declare module 'fastify' {
  interface FastifyRequest {
    authenticatedTenantId?: string;
  }
}

/**
 * Validate authentication via API key or JWT Bearer token.
 *
 * Supports four modes (tried in order):
 *  1. Admin JWT Bearer token — validates admin token, grants global access.
 *  2. Tenant-user JWT Bearer token — validates token and attaches tenantId.
 *  3. Per-tenant API key — looks up the tenant by apiKey.
 *  4. Global API key — falls back to env.API_KEY for admin access.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  // 1. Try JWT Bearer token
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    // 1a. Try admin JWT first
    try {
      const adminPayload = adminService.verifyToken(token);
      (request as any).adminUser = adminPayload;
      return; // Admin has global access
    } catch {
      // Not an admin token — try tenant user token
    }

    // 1b. Try tenant-user JWT
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
