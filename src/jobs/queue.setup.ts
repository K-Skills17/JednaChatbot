import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { messageProcessor } from './message.processor';
import { reminderProcessor } from './reminder.processor';

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

// ─── Workers ─────────────────────────────────────────────────

export function startMessageWorker(): void {
  const worker = new Worker(
    'message-processing',
    messageProcessor,
    {
      ...connection,
      concurrency: 5,
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Message job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Message job failed');
  });

  logger.info('Message processing worker started (AI engine)');
}

export function startReminderWorker(): void {
  const worker = new Worker(
    'booking-reminders',
    reminderProcessor,
    connection,
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Reminder job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Reminder job failed');
  });

  logger.info('Reminder worker started');
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
