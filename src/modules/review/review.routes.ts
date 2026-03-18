import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { reviewService } from './review.service';
import { authMiddleware } from '../../middleware/auth';

export function registerReviewRoutes(app: FastifyInstance): void {
  app.addHook('preHandler', authMiddleware);

  // List reviews for a tenant
  app.get(
    '/api/tenants/:tenantId/reviews',
    async (
      request: FastifyRequest<{
        Params: { tenantId: string };
        Querystring: { page?: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const page = parseInt(request.query.page ?? '1', 10);
      const limit = parseInt(request.query.limit ?? '20', 10);
      const result = await reviewService.list(request.params.tenantId, page, limit);
      return reply.send(result);
    },
  );

  // Get review stats
  app.get(
    '/api/tenants/:tenantId/reviews/stats',
    async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
      const stats = await reviewService.getStats(request.params.tenantId);
      return reply.send(stats);
    },
  );

  // Create a manual review request
  app.post(
    '/api/tenants/:tenantId/reviews',
    async (
      request: FastifyRequest<{
        Params: { tenantId: string };
        Body: { contactId: string; bookingId?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { contactId, bookingId } = request.body ?? {};
      if (!contactId) {
        return reply.code(400).send({ error: 'Missing required field: contactId' });
      }

      const review = await reviewService.createReviewRequest(
        request.params.tenantId,
        contactId,
        bookingId,
      );
      return reply.code(201).send(review);
    },
  );

  // Record a review response (rating + comment)
  app.patch(
    '/api/tenants/:tenantId/reviews/:reviewId',
    async (
      request: FastifyRequest<{
        Params: { tenantId: string; reviewId: string };
        Body: { rating: number; comment?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { rating, comment } = request.body ?? {};
      if (!rating || rating < 1 || rating > 5) {
        return reply.code(400).send({ error: 'Rating must be 1-5' });
      }

      try {
        const review = await reviewService.recordResponse(
          request.params.reviewId,
          rating,
          comment,
        );
        return reply.send(review);
      } catch (err: any) {
        if (err.message.includes('Rating must be')) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }
    },
  );
}
