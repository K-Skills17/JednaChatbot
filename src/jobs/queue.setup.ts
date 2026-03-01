import { Queue, Worker } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { messageProcessor } from './message.processor';
import { reminderProcessor } from './reminder.processor';
import { campaignProcessor } from './campaign.processor';
import { campaignSchedulerProcessor } from './campaign.scheduler';
import { notificationProcessor } from './notification.processor';

/**
 * Parse REDIS_URL into ioredis-compatible options.
 * Do NOT pass { url: '...' } — 'url' is not a valid ioredis option and causes
 * BullMQ's "client[commandNameWithVersion] is not a function" error.
 */
function parseRedisUrl(redisUrl: string) {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port, 10) || 6379,
    password: parsed.password || undefined,
    db: parsed.pathname ? parseInt(parsed.pathname.slice(1), 10) || 0 : 0,
    maxRetriesPerRequest: null as null, // Required by BullMQ
  };
}

function getConnection() {
  return { connection: parseRedisUrl(env.REDIS_URL) };
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

  worker.on('error', (err) => {
    logger.error({ err }, 'Message worker error');
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

  worker.on('error', (err) => {
    logger.error({ err }, 'Reminder worker error');
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

  worker.on('error', (err) => {
    logger.error({ err }, 'Campaign worker error');
  });

  logger.info('Campaign sending worker started');
}

export async function startCampaignScheduler(): Promise<void> {
  await getCampaignSchedulerQueue().add(
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

  worker.on('error', (err) => {
    logger.error({ err }, 'Campaign scheduler worker error');
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

  worker.on('error', (err) => {
    logger.error({ err }, 'Notification worker error');
  });

  logger.info('Notification worker started');
}
