import { FastifyRequest, FastifyReply } from 'fastify';
import { adminService, AdminJwtPayload } from '../modules/admin/admin.service';

declare module 'fastify' {
  interface FastifyRequest {
    adminUser?: AdminJwtPayload;
  }
}

/**
 * Middleware that requires a valid admin JWT token.
 * Sets request.adminUser on success.
 */
export async function adminAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Missing admin Bearer token' });
  }

  try {
    const payload = adminService.verifyToken(authHeader.slice(7));
    request.adminUser = payload;
  } catch {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired admin token' });
  }
}

/**
 * Middleware that requires superadmin role.
 * Must be used AFTER adminAuthMiddleware.
 */
export async function superadminOnly(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (request.adminUser?.role !== 'superadmin') {
    return reply.code(403).send({ error: 'Forbidden', message: 'Superadmin access required' });
  }
}
