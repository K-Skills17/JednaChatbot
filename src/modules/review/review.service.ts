import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

interface ReviewConfig {
  googleUrl?: string;
  facebookUrl?: string;
  delayHours?: number; // hours after booking completion to send review request
}

export class ReviewService {
  /** Create a review request for a completed booking */
  async createReviewRequest(tenantId: string, contactId: string, bookingId?: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error('Tenant not found');

    const config = (tenant.reviewConfig as ReviewConfig) ?? {};
    const reviewLink = config.googleUrl || config.facebookUrl || null;

    const review = await prisma.review.create({
      data: {
        tenantId,
        contactId,
        bookingId: bookingId ?? null,
        reviewLink,
        status: 'pending',
      },
    });

    logger.info({ tenantId, contactId, reviewId: review.id }, 'Review request created');
    return review;
  }

  /** Mark a review request as sent */
  async markSent(reviewId: string) {
    return prisma.review.update({
      where: { id: reviewId },
      data: { status: 'sent', requestSentAt: new Date() },
    });
  }

  /** Record a review response */
  async recordResponse(reviewId: string, rating: number, comment?: string) {
    if (rating < 1 || rating > 5) throw new Error('Rating must be 1-5');

    return prisma.review.update({
      where: { id: reviewId },
      data: {
        rating,
        comment: comment ?? null,
        status: 'responded',
        respondedAt: new Date(),
      },
    });
  }

  /** List reviews for a tenant */
  async list(tenantId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { contact: { select: { name: true, phone: true } } },
      }),
      prisma.review.count({ where: { tenantId } }),
    ]);

    return { reviews, total, page, limit };
  }

  /** Get review stats for a tenant */
  async getStats(tenantId: string) {
    const [total, responded, avgRating] = await Promise.all([
      prisma.review.count({ where: { tenantId } }),
      prisma.review.count({ where: { tenantId, status: 'responded' } }),
      prisma.review.aggregate({
        where: { tenantId, rating: { not: null } },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    return {
      totalRequests: total,
      totalResponses: responded,
      responseRate: total > 0 ? Math.round((responded / total) * 100) : 0,
      averageRating: avgRating._avg.rating ?? 0,
      ratedCount: avgRating._count.rating,
    };
  }
}

export const reviewService = new ReviewService();
