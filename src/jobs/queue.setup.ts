import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { messageProcessor } from './message.processor';
import { reminderProcessor } from './reminder.processor';
import { campaignProcessor } from './campaign.processor';
import { campaignSchedulerProcessor } from './campaign.scheduler';
import { notificationProcessor } from './notification.processor';

function getConnection() {
  return { connection: redis };
}

// ─── Lazy Queue Getters ─────────────────────────────────────
// Queues are created on first call, not at import time, so the
// module can be imported even when REDIS_URL is not configured.

let _messageQueue: Queue | null = null;
export function getMessageQueue(): Queue {
  if (!_messageQueue) _messageQueue = new Queue('message-processing', getConnection());
  return _messageQueue;
}

let _campaignQueue: Queue | null = null;
export function getCampaignQueue(): Queue {
  if (!_campaignQueue) _campaignQueue = new Queue('campaign-sending', getConnection());
  return _campaignQueue;
}

let _reminderQueue: Queue | null = null;
export function getReminderQueue(): Queue {
  if (!_reminderQueue) _reminderQueue = new Queue('booking-reminders', getConnection());
  return _reminderQueue;
}

let _campaignSchedulerQueue: Queue | null = null;
function getCampaignSchedulerQueue(): Queue {
  if (!_campaignSchedulerQueue) _campaignSchedulerQueue = new Queue('campaign-scheduler', getConnection());
  return _campaignSchedulerQueue;
}

let _notificationQueue: Queue | null = null;
export function getNotificationQueue(): Queue {
  if (!_notificationQueue) _notificationQueue = new Queue('notifications', getConnection());
  return _notificationQueue;
}

// ─── Workers ─────────────────────────────────────────────────

export function startMessageWorker(): void {
  const worker = new Worker(
    'message-processing',
    messageProcessor,
    {
      ...getConnection(),
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
    getConnection(),
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Reminder job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Reminder job failed');
  });

  logger.info('Reminder worker started');
}

export function startCampaignWorker(): void {
  const worker = new Worker(
    'campaign-sending',
    campaignProcessor,
    {
      ...getConnection(),
      concurrency: 3,
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Campaign send job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Campaign send job failed');
  });

  logger.info('Campaign sending worker started');
}

export function startCampaignScheduler(): void {
  getCampaignSchedulerQueue().add(
    'campaign-scheduler-tick',
    {},
    {
      repeat: { every: 5 * 60 * 1000 },
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );

  const worker = new Worker(
    'campaign-scheduler',
    campaignSchedulerProcessor,
    getConnection(),
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Campaign scheduler tick completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Campaign scheduler tick failed');
  });

  logger.info('Campaign scheduler started (every 5 minutes)');
}

export function startNotificationWorker(): void {
  const worker = new Worker(
    'notifications',
    notificationProcessor,
    {
      ...getConnection(),
      concurrency: 3,
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Notification job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Notification job failed');
  });

  logger.info('Notification worker started');
}
