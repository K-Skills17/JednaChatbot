import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../config/database';
import { authMiddleware } from '../../middleware/auth';

export function registerContactRoutes(app: FastifyInstance): void {
  app.addHook('preHandler', authMiddleware);

  // List contacts for a tenant (paginated)
  app.get(
    '/api/tenants/:tenantId/contacts',
    async (
      request: FastifyRequest<{
        Params: { tenantId: string };
        Querystring: { page?: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { tenantId } = request.params;
      const page = Math.max(1, parseInt(request.query.page || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || '25', 10)));
      const skip = (page - 1) * limit;

      const [contacts, total] = await Promise.all([
        prisma.contact.findMany({
          where: { tenantId },
          select: {
            id: true,
            phone: true,
            name: true,
            email: true,
            leadScore: true,
            leadStatus: true,
            tags: true,
            firstContactAt: true,
            lastContactAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.contact.count({ where: { tenantId } }),
      ]);

      return reply.send({ contacts, total, page, limit });
    },
  );
}
