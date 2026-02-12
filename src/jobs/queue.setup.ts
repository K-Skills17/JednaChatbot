import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

const connection = { connection: redis };

// ─── Queues ──────────────────────────────────────────────────

/** Queue for processing incoming WhatsApp messages */
export const messageQueue = new Queue('message-processing', connection);

/** Queue for sending outbound campaign messages */
export const campaignQueue = new Queue('campaign-sending', connection);

/** Queue for sending booking reminders */
export const reminderQueue = new Queue('booking-reminders', connection);

/** Queue for sending notifications to business owners */
export const notificationQueue = new Queue('notifications', connection);

// ─── Workers (Phase 2 will add real processors) ──────────────

/** Placeholder message processor — echoes back for now */
export function startMessageWorker(): void {
  const worker = new Worker(
    'message-processing',
    async (job: Job) => {
      const { tenantId, conversationId, phone, text, messageType, senderName } = job.data;

      logger.info(
        { tenantId, phone, text: text?.slice(0, 50) },
        'Processing message (echo mode)',
      );

      // Phase 2: This is where AI conversation engine will be plugged in.
      // For now, the message is stored and logged — no auto-reply yet.
    },
    connection,
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Message job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Message job failed');
  });

  logger.info('Message processing worker started');
}

/** Placeholder notification worker */
export function startNotificationWorker(): void {
  const worker = new Worker(
    'notifications',
    async (job: Job) => {
      logger.info({ type: job.data.type }, 'Notification job (placeholder)');
    },
    connection,
  );

  logger.info('Notification worker started');
}
