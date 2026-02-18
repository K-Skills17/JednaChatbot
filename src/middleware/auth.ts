import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env';

/** Validate API key in x-api-key header */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey || apiKey !== env.API_KEY) {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or missing API key' });
  }
}
