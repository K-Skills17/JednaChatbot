import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
  }
}

/** Extract tenant ID from route params and verify it exists */
export async function tenantContextMiddleware(
  request: FastifyRequest<{ Params: { tenantId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { tenantId } = request.params;

  if (!tenantId) {
    reply.code(400).send({ error: 'Missing tenant ID' });
    return;
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  if (!tenant) {
    reply.code(404).send({ error: 'Tenant not found' });
    return;
  }

  if (tenant.status === 'suspended') {
    reply.code(403).send({ error: 'Tenant suspended' });
    return;
  }

  request.tenantId = tenantId;
}
