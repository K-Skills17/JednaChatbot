import { Job } from 'bullmq';
import { processMessage } from '../ai/conversation.engine';
import { logger } from '../utils/logger';
import { MessageJobData } from '../ai/ai.types';

/** Process an incoming WhatsApp message through the AI conversation engine */
export async function messageProcessor(job: Job<MessageJobData>): Promise<void> {
  const { tenantId, phone, messageType, text } = job.data;

  logger.info(
    { jobId: job.id, tenantId, phone, messageType, text: text?.slice(0, 50) },
    'Processing message through AI engine',
  );

  try {
    await processMessage(job.data);
  } catch (err) {
    logger.error({ err, jobId: job.id, tenantId, phone }, 'Failed to process message');
    throw err; // Let BullMQ handle retries
  }
}
