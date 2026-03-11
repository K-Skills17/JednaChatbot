import { Queue, Worker } from 'bullmq';
import { env } from '../config/env';
import { buildRedisOptions } from '../config/redis';
import { logger } from '../utils/logger';
import { messageProcessor } from './message.processor';
import { reminderProcessor } from './reminder.processor';
import { campaignProcessor } from './campaign.processor';
import { campaignSchedulerProcessor } from './campaign.scheduler';
import { notificationProcessor } from './notification.processor';
import { dailySummaryProcessor } from './daily-summary.processor';

function getConnection() {
  return { connection: buildRedisOptions(env.REDIS_URL) };
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

let _dailySummaryQueue: Queue | null = null;
function getDailySummaryQueue(): Queue {
  if (!_dailySummaryQueue) _dailySummaryQueue = new Queue('daily-summary', getConnection());
  return _dailySummaryQueue;
}

// ─── Workers ─────────────────────────────────────────────────

const activeWorkers: Worker[] = [];

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

  activeWorkers.push(worker);
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

  activeWorkers.push(worker);
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

  activeWorkers.push(worker);
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

  activeWorkers.push(worker);
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

  activeWorkers.push(worker);
  logger.info('Notification worker started');
}

export async function startDailySummaryScheduler(): Promise<void> {
  await getDailySummaryQueue().add(
    'daily-summary-tick',
    {},
    {
      repeat: { pattern: '0 20 * * *' }, // Every day at 20:00 UTC (17:00 BRT)
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );

  const worker = new Worker(
    'daily-summary',
    dailySummaryProcessor,
    getConnection(),
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Daily summary tick completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Daily summary tick failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Daily summary worker error');
  });

  activeWorkers.push(worker);
  logger.info('Daily summary scheduler started (daily at 20:00 UTC)');
}

/** Gracefully stop all workers, waiting for in-flight jobs to finish */
export async function stopAllWorkers(): Promise<void> {
  logger.info(`Stopping ${activeWorkers.length} worker(s)...`);
  await Promise.all(activeWorkers.map((w) => w.close()));
  activeWorkers.length = 0;
  logger.info('All workers stopped');
}
