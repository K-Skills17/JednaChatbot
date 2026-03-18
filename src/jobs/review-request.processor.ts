import { Job } from 'bullmq';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { sendMessage } from '../modules/whatsapp/message.sender';
import { reviewService } from '../modules/review/review.service';

interface ReviewRequestJobData {
  bookingId: string;
  tenantId: string;
  contactId: string;
}

interface ReviewConfig {
  googleUrl?: string;
  facebookUrl?: string;
  delayHours?: number;
}

/**
 * Sends a review request message via WhatsApp after a booking is completed.
 * Triggered by the reminder processor when a booking transitions to "completed",
 * or scheduled as a delayed job after booking completion.
 */
export async function reviewRequestProcessor(job: Job<ReviewRequestJobData>): Promise<void> {
  const { bookingId, tenantId, contactId } = job.data;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { tenant: true, contact: true },
  });

  if (!booking) {
    logger.warn({ bookingId }, 'Booking not found for review request');
    return;
  }

  // Only send for completed bookings
  if (booking.status !== 'completed') {
    logger.info({ bookingId, status: booking.status }, 'Booking not completed, skipping review request');
    return;
  }

  // Skip if contact opted out
  if (booking.contact.optedOut) {
    logger.info({ bookingId }, 'Skipping review request for opted-out contact');
    return;
  }

  if (!booking.tenant.evolutionInstanceId) {
    logger.warn({ bookingId }, 'No Evolution instance for review request');
    return;
  }

  // Check if we already sent a review request for this booking
  const existing = await prisma.review.findFirst({
    where: { tenantId, contactId, bookingId, status: { in: ['sent', 'responded'] } },
  });

  if (existing) {
    logger.info({ bookingId }, 'Review request already sent for this booking');
    return;
  }

  // Create the review record
  const review = await reviewService.createReviewRequest(tenantId, contactId, bookingId);

  // Find conversation
  const conversation = await prisma.conversation.findFirst({
    where: { tenantId, contactId, status: { in: ['active', 'closed'] } },
    orderBy: { startedAt: 'desc' },
  });

  if (!conversation) {
    logger.warn({ bookingId }, 'No conversation found for review request');
    return;
  }

  // Build review message
  const config = (booking.tenant.reviewConfig as ReviewConfig) ?? {};
  const contactName = booking.contact.name ?? '';
  const reviewLink = config.googleUrl || config.facebookUrl || null;

  let reviewText = `Oi${contactName ? ` ${contactName}` : ''}! Esperamos que tudo tenha corrido bem na sua consulta. ` +
    `Sua opiniao e muito importante para nos! `;

  if (reviewLink) {
    reviewText += `\n\nPoderia nos avaliar? Leva menos de 1 minuto:\n${reviewLink}`;
  } else {
    reviewText += `\n\nDe 1 a 5, como voce avaliaria seu atendimento? Responda com um numero.`;
  }

  await sendMessage({
    tenantId,
    conversationId: conversation.id,
    instanceName: booking.tenant.evolutionInstanceId,
    phone: booking.contact.phone,
    text: reviewText,
  });

  await reviewService.markSent(review.id);

  logger.info({ bookingId, contactId, reviewId: review.id }, 'Review request sent');
}
