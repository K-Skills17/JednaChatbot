import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { bookingService } from './booking.service';
import { authMiddleware } from '../../middleware/auth';
import { env } from '../../config/env';
import { prisma } from '../../config/database';

// Lazy-load googleapis — it takes ~5s to import and blocks the entire server startup
function getGoogle() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('googleapis').google as typeof import('googleapis').google;
}

/** Ensure redirect URI has https:// prefix */
function normalizeRedirectUri(uri: string): string {
  if (!uri) return uri;
  if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
    return `https://${uri}`;
  }
  return uri;
}

export function registerBookingRoutes(app: FastifyInstance): void {
  // All booking routes require API key (calendar OAuth is in app.ts, outside this plugin)
  app.addHook('preHandler', authMiddleware);

  // Create a booking
  app.post(
    '/api/tenants/:tenantId/bookings',
    async (
      request: FastifyRequest<{
        Params: { tenantId: string };
        Body: {
          contactId: string;
          scheduledAt: string;
          durationMinutes?: number;
          appointmentType?: string;
          notes?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { tenantId } = request.params;
      const { contactId, scheduledAt, durationMinutes, appointmentType, notes } = request.body;

      const booking = await bookingService.create({
        tenantId,
        contactId,
        scheduledAt: new Date(scheduledAt),
        durationMinutes,
        appointmentType,
        notes,
      });

      return reply.code(201).send(booking);
    },
  );

  // List bookings for a tenant
  app.get(
    '/api/tenants/:tenantId/bookings',
    async (
      request: FastifyRequest<{
        Params: { tenantId: string };
        Querystring: { status?: string; from?: string; to?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const bookings = await bookingService.listByTenant(request.params.tenantId, {
        status: request.query.status,
        from: request.query.from ? new Date(request.query.from) : undefined,
        to: request.query.to ? new Date(request.query.to) : undefined,
      });
      return reply.send(bookings);
    },
  );

  // Get available slots for a date
  app.get(
    '/api/tenants/:tenantId/bookings/slots',
    async (
      request: FastifyRequest<{
        Params: { tenantId: string };
        Querystring: { date: string; duration?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const slots = await bookingService.getAvailableSlots(
        request.params.tenantId,
        new Date(request.query.date),
        request.query.duration ? parseInt(request.query.duration, 10) : undefined,
      );
      return reply.send(slots);
    },
  );

  // Cancel a booking
  app.post(
    '/api/tenants/:tenantId/bookings/:bookingId/cancel',
    async (
      request: FastifyRequest<{ Params: { tenantId: string; bookingId: string } }>,
      reply: FastifyReply,
    ) => {
      await bookingService.cancel(request.params.bookingId);
      return reply.code(204).send();
    },
  );

  // Reschedule a booking
  app.post(
    '/api/tenants/:tenantId/bookings/:bookingId/reschedule',
    async (
      request: FastifyRequest<{
        Params: { tenantId: string; bookingId: string };
        Body: { scheduledAt: string };
      }>,
      reply: FastifyReply,
    ) => {
      const booking = await bookingService.reschedule(
        request.params.bookingId,
        new Date(request.body.scheduledAt),
      );
      return reply.send(booking);
    },
  );

  // Mark a booking as completed (prevents no-show follow-up)
  app.post(
    '/api/tenants/:tenantId/bookings/:bookingId/complete',
    async (
      request: FastifyRequest<{ Params: { tenantId: string; bookingId: string } }>,
      reply: FastifyReply,
    ) => {
      const booking = await bookingService.complete(request.params.bookingId);
      return reply.send(booking);
    },
  );

  // ─── Google Calendar OAuth ──────────────────────────────────

  // Start OAuth flow for a tenant
  app.get(
    '/api/tenants/:tenantId/calendar/auth',
    async (
      request: FastifyRequest<{ Params: { tenantId: string } }>,
      reply: FastifyReply,
    ) => {
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return reply.code(400).send({ error: 'Google Calendar not configured' });
      }

      const redirectUri = normalizeRedirectUri(env.GOOGLE_REDIRECT_URI ?? '');

      const oauth2Client = new (getGoogle()).auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        redirectUri,
      );

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/calendar'],
        state: request.params.tenantId,
        prompt: 'consent',
      });

      return reply.send({ authUrl });
    },
  );
}
