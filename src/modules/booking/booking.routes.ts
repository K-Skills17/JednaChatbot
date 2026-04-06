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

export function registerBookingRoutes(app: FastifyInstance): void {
  // All booking routes require API key
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

      const oauth2Client = new (getGoogle()).auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        env.GOOGLE_REDIRECT_URI,
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

  // OAuth callback — exchanges code for tokens
  app.get(
    '/api/calendar/callback',
    async (
      request: FastifyRequest<{ Querystring: { code: string; state: string } }>,
      reply: FastifyReply,
    ) => {
      const { code, state: tenantId } = request.query;

      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return reply.code(400).send({ error: 'Google Calendar not configured' });
      }

      const oauth2Client = new (getGoogle()).auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        env.GOOGLE_REDIRECT_URI,
      );

      const { tokens } = await oauth2Client.getToken(code);

      // Store tokens in tenant's bookingConfig
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return reply.code(404).send({ error: 'Tenant not found' });

      const existingConfig = (tenant.bookingConfig as Record<string, any>) ?? {};

      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          bookingConfig: {
            ...existingConfig,
            googleCalendar: {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              calendarId: 'primary',
            },
          },
        },
      });

      return reply.send({ success: true, message: 'Google Calendar connected' });
    },
  );
}
