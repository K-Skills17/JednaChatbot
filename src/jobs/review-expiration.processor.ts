import { Job } from 'bullmq';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const EXPIRATION_DAYS = 7;

/**
 * Scheduled job that expires stale review requests.
 * Runs daily and marks reviews as "expired" if they've been in
 * "sent" status for more than EXPIRATION_DAYS without a response.
 * Also clears awaiting_review state on associated conversations.
 */
export async function reviewExpirationProcessor(_job: Job): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - EXPIRATION_DAYS);

  // Find all stale sent reviews
  const staleReviews = await prisma.review.findMany({
    where: {
      status: 'sent',
      requestSentAt: { lt: cutoff },
    },
    select: { id: true, tenantId: true, contactId: true },
  });

  if (staleReviews.length === 0) {
    logger.debug('No stale review requests to expire');
    return;
  }

  // Expire them in bulk
  await prisma.review.updateMany({
    where: {
      id: { in: staleReviews.map((r) => r.id) },
    },
    data: { status: 'expired' },
  });

  // Clear awaiting_review state on conversations still waiting
  for (const review of staleReviews) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        tenantId: review.tenantId,
        contactId: review.contactId,
        status: 'active',
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!conversation) continue;

    const ctx = conversation.context as Record<string, any> | null;
    if (ctx?.state === 'awaiting_review' && ctx?.pendingReviewId === review.id) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          context: { ...ctx, state: 'closed', pendingReviewId: undefined },
          status: 'closed',
          closedAt: new Date(),
        },
      });
    }
  }

  logger.info({ count: staleReviews.length }, 'Expired stale review requests');
}
