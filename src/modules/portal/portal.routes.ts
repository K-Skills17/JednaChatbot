import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { tenantPortalHtml } from '../../views/tenant-portal';

export function registerPortalRoutes(app: FastifyInstance): void {
  // Serve the tenant self-service portal (no auth — login handled client-side)
  app.get(
    '/portal/:tenantId',
    async (_request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
      return reply.type('text/html').send(tenantPortalHtml());
    },
  );
}
