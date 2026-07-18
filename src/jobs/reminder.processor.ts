import { Job } from 'bullmq';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { sendMessage } from '../modules/whatsapp/message.sender';
import { formatDatePtBr } from '../utils/timezone.utils';

interface ReminderJobData {
  bookingId: string;
  tenantId: string;
  contactId: string;
  type: '24h' | '1h';
}

interface NoShowJobData {
  bookingId: string;
  tenantId: string;
  contactId: string;
}

/** Process a booking reminder — sends an SMS to the contact */
export async function reminderProcessor(job: Job<ReminderJobData | NoShowJobData>): Promise<void> {
  if (job.name === 'no-show-followup') {
    return noShowFollowUpProcessor(job as Job<NoShowJobData>);
  }

  const { bookingId, tenantId, contactId, type } = job.data as ReminderJobData;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { tenant: true, contact: true },
  });

  if (!booking) {
    logger.warn({ bookingId }, 'Booking not found for reminder');
    return;
  }

  // Skip if booking was cancelled
  if (booking.status === 'cancelled') {
    logger.info({ bookingId }, 'Skipping reminder for cancelled booking');
    return;
  }

  // Skip if contact opted out
  if (booking.contact.optedOut) {
    logger.info({ bookingId }, 'Skipping reminder for opted-out contact');
    return;
  }

  // Find active conversation or skip (we still send the reminder)
  const conversation = await prisma.conversation.findFirst({
    where: { tenantId, contactId, status: { in: ['active', 'closed'] } },
    orderBy: { startedAt: 'desc' },
  });

  if (!conversation) {
    logger.warn({ bookingId }, 'No conversation found for reminder');
    return;
  }

  const formattedDate = formatDatePtBr(booking.scheduledAt ?? new Date(), booking.tenant.timezone);
  const contactName = booking.contact.name ? booking.contact.name.split(' ')[0] : '';

  let reminderText: string;
  if (type === '24h') {
    const meetInfo = booking.meetLink ? ` Meeting link: ${booking.meetLink}` : '';
    reminderText = `Hi${contactName ? ` ${contactName}` : ''}! Just a reminder about your appointment tomorrow, ${formattedDate}. Reply YES to confirm or RESCHEDULE to pick a new time.${meetInfo}`;
  } else {
    const meetInfo = booking.meetLink ? ` Join here: ${booking.meetLink}` : '';
    reminderText = `Hi${contactName ? ` ${contactName}` : ''}! Your appointment is in 1 hour at ${formattedDate}. See you soon!${meetInfo}`;
  }

  // Enforce 300-char SMS limit
  if (reminderText.length > 300) reminderText = reminderText.slice(0, 297) + '...';

  await sendMessage({
    tenantId,
    conversationId: conversation.id,
    phone: booking.contact.phone,
    text: reminderText,
    channel: 'sms',
  });

  // Mark reminder as sent (only once, on the first reminder)
  if (!booking.reminderSent) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { reminderSent: true },
    });
  }

  logger.info({ bookingId, type }, 'Booking reminder sent');
}

/**
 * No-show follow-up processor.
 * Fires 30 min after the scheduled appointment time.
 * If the booking is still "confirmed" (not marked as "completed"),
 * marks it as no_show and sends a re-engagement SMS.
 */
async function noShowFollowUpProcessor(job: Job<NoShowJobData>): Promise<void> {
  const { bookingId, tenantId, contactId } = job.data;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { tenant: true, contact: true },
  });

  if (!booking) {
    logger.warn({ bookingId }, 'Booking not found for no-show check');
    return;
  }

  // Only process if still "confirmed" — means they didn't show up
  // If it was marked "completed" or "cancelled", skip
  if (booking.status !== 'confirmed') {
    logger.info({ bookingId, status: booking.status }, 'Booking not in confirmed state, skipping no-show follow-up');
    return;
  }

  // Skip if already sent
  if (booking.noShowFollowUpSent) {
    logger.info({ bookingId }, 'No-show follow-up already sent');
    return;
  }

  // Skip if contact opted out
  if (booking.contact.optedOut) {
    logger.info({ bookingId }, 'Skipping no-show follow-up for opted-out contact');
    return;
  }

  // Mark booking as no_show
  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'no_show', noShowFollowUpSent: true },
  });

  // Update contact status back to qualified so they re-enter the funnel
  await prisma.contact.update({
    where: { id: contactId },
    data: { leadStatus: 'qualified' },
  });

  // Find conversation to send message through
  const conversation = await prisma.conversation.findFirst({
    where: { tenantId, contactId, status: { in: ['active', 'closed'] } },
    orderBy: { startedAt: 'desc' },
  });

  if (!conversation) {
    logger.warn({ bookingId }, 'No conversation found for no-show follow-up');
    return;
  }

  const firstName = booking.contact.name ? booking.contact.name.split(' ')[0] : '';
  const formattedDate = formatDatePtBr(booking.scheduledAt ?? new Date(), booking.tenant.timezone);

  const followUpText =
    `Hi${firstName ? ` ${firstName}` : ''}! We noticed you weren't able to make your ${formattedDate} appointment. ` +
    `No worries — would you like to reschedule? Just reply here and we'll find a time that works for you.`;

  await sendMessage({
    tenantId,
    conversationId: conversation.id,
    phone: booking.contact.phone,
    text: followUpText,
    channel: 'sms',
  });

  // Reopen the conversation so the AI can handle the rescheduling
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { status: 'active' },
  });

  logger.info({ bookingId, contactId }, 'No-show follow-up sent, conversation reopened for rescheduling');
}
