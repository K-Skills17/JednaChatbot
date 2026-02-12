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

/** Process a booking reminder — sends a WhatsApp message to the contact */
export async function reminderProcessor(job: Job<ReminderJobData>): Promise<void> {
  const { bookingId, tenantId, contactId, type } = job.data;

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

  if (!booking.tenant.evolutionInstanceId) {
    logger.warn({ bookingId }, 'No Evolution instance for reminder');
    return;
  }

  const formattedDate = formatDatePtBr(booking.scheduledAt, booking.tenant.timezone);
  const contactName = booking.contact.name ?? '';

  const reminderText =
    type === '24h'
      ? `Olá${contactName ? ` ${contactName}` : ''}! 😊 Só passando para lembrar do seu agendamento amanhã, ${formattedDate}. Confirmado? Responda "sim" para confirmar ou "reagendar" se precisar mudar.`
      : `Oi${contactName ? ` ${contactName}` : ''}! Seu agendamento é daqui a 1 hora, às ${formattedDate}. Nos vemos em breve! 🙂`;

  await sendMessage({
    tenantId,
    conversationId: conversation.id,
    instanceName: booking.tenant.evolutionInstanceId,
    phone: booking.contact.phone,
    text: reminderText,
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
