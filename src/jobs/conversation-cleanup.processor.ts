import { Job } from 'bullmq';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const IDLE_TIMEOUT_HOURS = 48;

/**
 * Closes conversations that have been idle for more than IDLE_TIMEOUT_HOURS.
 * Runs on a schedule (every hour).
 */
export async function conversationCleanupProcessor(_job: Job): Promise<void> {
  const cutoff = new Date(Date.now() - IDLE_TIMEOUT_HOURS * 60 * 60 * 1000);

  try {
    const result = await prisma.conversation.updateMany({
      where: {
        status: 'active',
        lastMessageAt: { lt: cutoff },
      },
      data: {
        status: 'closed',
        closedAt: new Date(),
      },
    });

    if (result.count > 0) {
      logger.info({ closed: result.count, cutoff: cutoff.toISOString() }, 'Auto-closed idle conversations');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to auto-close idle conversations');
    throw err;
  }
}
