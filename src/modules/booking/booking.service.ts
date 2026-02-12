import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { formatDatePtBr } from '../../utils/timezone.utils';
import { getCalendarClient, CalendarSlot } from './calendar.client';
import { reminderQueue } from '../../jobs/queue.setup';

interface CreateBookingInput {
  tenantId: string;
  contactId: string;
  scheduledAt: Date;
  durationMinutes?: number;
  appointmentType?: string;
  notes?: string;
}

interface BookingWithDetails {
  id: string;
  tenantId: string;
  contactId: string;
  scheduledAt: Date;
  durationMinutes: number;
  status: string;
  appointmentType: string | null;
  calendarEventId: string | null;
  notes: string | null;
}

export class BookingService {
  /** Create a booking and optionally sync to Google Calendar */
  async create(input: CreateBookingInput): Promise<BookingWithDetails> {
    const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new Error('Tenant not found');

    const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
    if (!contact) throw new Error('Contact not found');

    const durationMinutes = input.durationMinutes ?? 30;

    // Create booking record
    const booking = await prisma.booking.create({
      data: {
        tenantId: input.tenantId,
        contactId: input.contactId,
        scheduledAt: input.scheduledAt,
        durationMinutes,
        appointmentType: input.appointmentType,
        notes: input.notes,
        status: 'confirmed',
      },
    });

    // Sync to Google Calendar if configured
    const calendarClient = getCalendarClient(tenant.bookingConfig);
    if (calendarClient) {
      try {
        const event = await calendarClient.createEvent(
          `${tenant.businessName} - ${contact.name ?? contact.phone}`,
          `Agendamento com ${contact.name ?? 'contato'}\nTipo: ${input.appointmentType ?? 'Consulta'}`,
          input.scheduledAt,
          durationMinutes,
          tenant.timezone,
          contact.phone,
        );

        await prisma.booking.update({
          where: { id: booking.id },
          data: { calendarEventId: event.eventId },
        });

        booking.calendarEventId = event.eventId;
      } catch (err) {
        logger.error({ err, bookingId: booking.id }, 'Failed to create calendar event');
      }
    }

    // Schedule reminder (24h before and 1h before)
    await this.scheduleReminders(booking.id, input.tenantId, input.contactId, input.scheduledAt);

    // Update contact status
    await prisma.contact.update({
      where: { id: input.contactId },
      data: { leadStatus: 'booked' },
    });

    logger.info(
      { bookingId: booking.id, scheduledAt: input.scheduledAt },
      'Booking created',
    );

    return booking as BookingWithDetails;
  }

  /** Get a booking by ID */
  async getById(id: string): Promise<BookingWithDetails | null> {
    return prisma.booking.findUnique({ where: { id } }) as Promise<BookingWithDetails | null>;
  }

  /** List bookings for a tenant */
  async listByTenant(tenantId: string, options?: { status?: string; from?: Date; to?: Date }) {
    const where: Record<string, any> = { tenantId };
    if (options?.status) where.status = options.status;
    if (options?.from || options?.to) {
      where.scheduledAt = {};
      if (options?.from) where.scheduledAt.gte = options.from;
      if (options?.to) where.scheduledAt.lte = options.to;
    }

    return prisma.booking.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      include: { contact: { select: { name: true, phone: true } } },
    });
  }

  /** Cancel a booking */
  async cancel(id: string): Promise<void> {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { tenant: true },
    });
    if (!booking) throw new Error('Booking not found');

    // Cancel Google Calendar event
    if (booking.calendarEventId) {
      const calendarClient = getCalendarClient(booking.tenant.bookingConfig);
      if (calendarClient) {
        try {
          await calendarClient.cancelEvent(booking.calendarEventId);
        } catch (err) {
          logger.warn({ err, bookingId: id }, 'Failed to cancel calendar event');
        }
      }
    }

    await prisma.booking.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    logger.info({ bookingId: id }, 'Booking cancelled');
  }

  /** Reschedule a booking */
  async reschedule(id: string, newScheduledAt: Date): Promise<BookingWithDetails> {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { tenant: true },
    });
    if (!booking) throw new Error('Booking not found');

    // Reschedule Google Calendar event
    if (booking.calendarEventId) {
      const calendarClient = getCalendarClient(booking.tenant.bookingConfig);
      if (calendarClient) {
        try {
          await calendarClient.rescheduleEvent(
            booking.calendarEventId,
            newScheduledAt,
            booking.durationMinutes,
            booking.tenant.timezone,
          );
        } catch (err) {
          logger.warn({ err, bookingId: id }, 'Failed to reschedule calendar event');
        }
      }
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { scheduledAt: newScheduledAt, reminderSent: false },
    });

    logger.info({ bookingId: id, newScheduledAt }, 'Booking rescheduled');
    return updated as BookingWithDetails;
  }

  /** Get available slots for a tenant on a given date */
  async getAvailableSlots(
    tenantId: string,
    date: Date,
    durationMinutes = 30,
  ): Promise<CalendarSlot[]> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error('Tenant not found');

    const businessHours = tenant.businessHours as { start: string; end: string; days: number[] };

    // Check if the day is a working day
    const dayOfWeek = date.getDay();
    if (!businessHours.days.includes(dayOfWeek)) {
      return []; // Not a working day
    }

    const calendarClient = getCalendarClient(tenant.bookingConfig);
    if (calendarClient) {
      return calendarClient.getAvailableSlots(date, businessHours, durationMinutes, tenant.timezone);
    }

    // No Google Calendar configured — return all business hour slots
    return generateDefaultSlots(date, businessHours, durationMinutes);
  }

  /** Schedule WhatsApp reminders for a booking */
  private async scheduleReminders(
    bookingId: string,
    tenantId: string,
    contactId: string,
    scheduledAt: Date,
  ): Promise<void> {
    const now = Date.now();

    // 24h before
    const reminder24h = scheduledAt.getTime() - 24 * 60 * 60 * 1000;
    if (reminder24h > now) {
      await reminderQueue.add(
        'booking-reminder',
        { bookingId, tenantId, contactId, type: '24h' },
        { delay: reminder24h - now },
      );
    }

    // 1h before
    const reminder1h = scheduledAt.getTime() - 60 * 60 * 1000;
    if (reminder1h > now) {
      await reminderQueue.add(
        'booking-reminder',
        { bookingId, tenantId, contactId, type: '1h' },
        { delay: reminder1h - now },
      );
    }
  }
}

/** Generate time slots without Google Calendar (basic grid) */
function generateDefaultSlots(
  date: Date,
  businessHours: { start: string; end: string },
  durationMinutes: number,
): CalendarSlot[] {
  const [startH, startM] = businessHours.start.split(':').map(Number);
  const [endH, endM] = businessHours.end.split(':').map(Number);

  const dayStart = new Date(date);
  dayStart.setHours(startH, startM, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(endH, endM, 0, 0);

  const slots: CalendarSlot[] = [];
  let cursor = new Date(dayStart);

  while (cursor.getTime() + durationMinutes * 60000 <= dayEnd.getTime()) {
    slots.push({
      start: new Date(cursor),
      end: new Date(cursor.getTime() + durationMinutes * 60000),
    });
    cursor = new Date(cursor.getTime() + 30 * 60000);
  }

  return slots;
}

export const bookingService = new BookingService();
