import { google, calendar_v3 } from 'googleapis';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

/** Per-tenant Google Calendar credentials stored in tenant.bookingConfig JSON */
export interface CalendarCredentials {
  accessToken: string;
  refreshToken: string;
  calendarId?: string; // defaults to 'primary'
}

export interface CalendarSlot {
  start: Date;
  end: Date;
}

export interface CalendarEvent {
  eventId: string;
  summary: string;
  start: Date;
  end: Date;
  htmlLink?: string;
}

/**
 * Google Calendar client for managing tenant appointments.
 * Each tenant has their own OAuth tokens stored in bookingConfig.
 */
export class CalendarClient {
  private calendar: calendar_v3.Calendar;
  private calendarId: string;

  constructor(credentials: CalendarCredentials) {
    const oauth2Client = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
    });

    this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    this.calendarId = credentials.calendarId ?? 'primary';
  }

  /** Get busy times for a date range to find available slots */
  async getBusyTimes(startDate: Date, endDate: Date): Promise<CalendarSlot[]> {
    const response = await this.calendar.freebusy.query({
      requestBody: {
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        items: [{ id: this.calendarId }],
      },
    });

    const busy = response.data.calendars?.[this.calendarId]?.busy ?? [];
    return busy
      .filter((slot) => slot.start && slot.end)
      .map((slot) => ({
        start: new Date(slot.start!),
        end: new Date(slot.end!),
      }));
  }

  /** Find available slots for a given day within business hours */
  async getAvailableSlots(
    date: Date,
    businessHours: { start: string; end: string },
    durationMinutes: number,
    timezone: string,
  ): Promise<CalendarSlot[]> {
    const [startH, startM] = businessHours.start.split(':').map(Number);
    const [endH, endM] = businessHours.end.split(':').map(Number);

    // Build day start/end in the tenant's timezone
    const dayStart = new Date(date);
    dayStart.setHours(startH, startM, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(endH, endM, 0, 0);

    const busyTimes = await this.getBusyTimes(dayStart, dayEnd);

    // Generate slots, removing busy ones
    const slots: CalendarSlot[] = [];
    let cursor = new Date(dayStart);

    while (cursor.getTime() + durationMinutes * 60000 <= dayEnd.getTime()) {
      const slotEnd = new Date(cursor.getTime() + durationMinutes * 60000);

      const isBusy = busyTimes.some(
        (busy) => cursor < busy.end && slotEnd > busy.start,
      );

      if (!isBusy) {
        slots.push({ start: new Date(cursor), end: slotEnd });
      }

      // Move to next slot (30-min increments)
      cursor = new Date(cursor.getTime() + 30 * 60000);
    }

    return slots;
  }

  /** Create a calendar event for a booking */
  async createEvent(
    summary: string,
    description: string,
    startTime: Date,
    durationMinutes: number,
    timezone: string,
    attendeePhone?: string,
  ): Promise<CalendarEvent> {
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

    const response = await this.calendar.events.insert({
      calendarId: this.calendarId,
      requestBody: {
        summary,
        description: `${description}\n\nTelefone: ${attendeePhone ?? 'N/A'}`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: timezone,
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: timezone,
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 30 },
            { method: 'popup', minutes: 10 },
          ],
        },
      },
    });

    logger.info({ eventId: response.data.id, summary }, 'Calendar event created');

    return {
      eventId: response.data.id!,
      summary: response.data.summary!,
      start: new Date(response.data.start?.dateTime ?? startTime),
      end: new Date(response.data.end?.dateTime ?? endTime),
      htmlLink: response.data.htmlLink ?? undefined,
    };
  }

  /** Cancel (delete) a calendar event */
  async cancelEvent(eventId: string): Promise<void> {
    await this.calendar.events.delete({
      calendarId: this.calendarId,
      eventId,
    });
    logger.info({ eventId }, 'Calendar event cancelled');
  }

  /** Reschedule a calendar event */
  async rescheduleEvent(
    eventId: string,
    newStart: Date,
    durationMinutes: number,
    timezone: string,
  ): Promise<CalendarEvent> {
    const newEnd = new Date(newStart.getTime() + durationMinutes * 60000);

    const response = await this.calendar.events.patch({
      calendarId: this.calendarId,
      eventId,
      requestBody: {
        start: {
          dateTime: newStart.toISOString(),
          timeZone: timezone,
        },
        end: {
          dateTime: newEnd.toISOString(),
          timeZone: timezone,
        },
      },
    });

    logger.info({ eventId, newStart }, 'Calendar event rescheduled');

    return {
      eventId: response.data.id!,
      summary: response.data.summary!,
      start: new Date(response.data.start?.dateTime ?? newStart),
      end: new Date(response.data.end?.dateTime ?? newEnd),
      htmlLink: response.data.htmlLink ?? undefined,
    };
  }
}

/**
 * Build a CalendarClient for a tenant using their stored booking config.
 * Returns null if Google Calendar is not configured for this tenant.
 */
export function getCalendarClient(bookingConfig: any): CalendarClient | null {
  if (!bookingConfig?.googleCalendar?.accessToken) return null;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;

  return new CalendarClient({
    accessToken: bookingConfig.googleCalendar.accessToken,
    refreshToken: bookingConfig.googleCalendar.refreshToken,
    calendarId: bookingConfig.googleCalendar.calendarId,
  });
}
