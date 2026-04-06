import { FastifyRequest, FastifyReply } from 'fastify';
import { authService, JwtPayload } from '../modules/auth/auth.service';

declare module 'fastify' {
  interface FastifyRequest {
    jwtUser?: JwtPayload;
  }
}

/**
 * JWT-only authentication middleware.
 * Validates Bearer token from Authorization header.
 * Use this for portal routes that require tenant user login.
 */
export async function jwtAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = authService.verifyToken(token);
    request.jwtUser = payload;
    request.authenticatedTenantId = payload.tenantId;
  } catch {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}
