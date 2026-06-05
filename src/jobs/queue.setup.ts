import { Queue, Worker } from 'bullmq';
import { env } from '../config/env';
import { buildRedisOptions } from '../config/redis';
import { logger } from '../utils/logger';
import { messageProcessor } from './message.processor';
import { reminderProcessor } from './reminder.processor';
import { campaignProcessor } from './campaign.processor';
import { campaignSchedulerProcessor } from './campaign.scheduler';
import { notificationProcessor } from './notification.processor';
import { facebookLeadProcessor } from '../modules/facebook/facebook.lead.processor';
import { dailySummaryProcessor } from './daily-summary.processor';
import { reviewRequestProcessor } from './review-request.processor';
import { reviewExpirationProcessor } from './review-expiration.processor';
import { diagnosticProcessor } from '../modules/diagnostic/diagnostic.processor';
import { keepaliveProcessor } from './keepalive.processor';
import { conversationCleanupProcessor } from './conversation-cleanup.processor';

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

let _facebookLeadQueue: Queue | null = null;
export function getFacebookLeadQueue(): Queue {
  if (!_facebookLeadQueue) _facebookLeadQueue = new Queue('facebook-leads', getConnection());
  return _facebookLeadQueue;
}

let _reviewQueue: Queue | null = null;
export function getReviewQueue(): Queue {
  if (!_reviewQueue) _reviewQueue = new Queue('review-requests', getConnection());
  return _reviewQueue;
}

let _reviewExpirationQueue: Queue | null = null;
function getReviewExpirationQueue(): Queue {
  if (!_reviewExpirationQueue) _reviewExpirationQueue = new Queue('review-expiration', getConnection());
  return _reviewExpirationQueue;
}

let _diagnosticQueue: Queue | null = null;
export function getDiagnosticQueue(): Queue {
  if (!_diagnosticQueue) _diagnosticQueue = new Queue('diagnostic-results', getConnection());
  return _diagnosticQueue;
}

let _keepaliveQueue: Queue | null = null;
function getKeepaliveQueue(): Queue {
  if (!_keepaliveQueue) _keepaliveQueue = new Queue('whatsapp-keepalive', getConnection());
  return _keepaliveQueue;
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

export function startFacebookLeadWorker(): void {
  const worker = new Worker(
    'facebook-leads',
    facebookLeadProcessor,
    {
      ...getConnection(),
      concurrency: 3,
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Facebook lead job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Facebook lead job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Facebook lead worker error');
  });

  activeWorkers.push(worker);
  logger.info('Facebook lead processing worker started');
}

export function startReviewWorker(): void {
  const worker = new Worker(
    'review-requests',
    reviewRequestProcessor,
    getConnection(),
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Review request job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Review request job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Review request worker error');
  });

  activeWorkers.push(worker);
  logger.info('Review request worker started');
}

export function startDiagnosticWorker(): void {
  const worker = new Worker(
    'diagnostic-results',
    diagnosticProcessor,
    {
      ...getConnection(),
      concurrency: 3,
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Diagnostic job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Diagnostic job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Diagnostic worker error');
  });

  activeWorkers.push(worker);
  logger.info('Diagnostic processing worker started');
}

export async function startKeepaliveScheduler(): Promise<void> {
  await getKeepaliveQueue().add(
    'whatsapp-keepalive-tick',
    {},
    {
      repeat: { every: 5 * 60 * 1000 }, // Every 5 minutes
      removeOnComplete: 5,
      removeOnFail: 10,
    },
  );

  const worker = new Worker(
    'whatsapp-keepalive',
    keepaliveProcessor,
    getConnection(),
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Keepalive tick completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Keepalive tick failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Keepalive worker error');
  });

  activeWorkers.push(worker);
  logger.info('WhatsApp keepalive scheduler started (every 5 minutes)');
}

export async function startReviewExpirationScheduler(): Promise<void> {
  await getReviewExpirationQueue().add(
    'review-expiration-tick',
    {},
    {
      repeat: { pattern: '0 6 * * *' }, // Every day at 06:00 UTC (03:00 BRT)
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );

  const worker = new Worker(
    'review-expiration',
    reviewExpirationProcessor,
    getConnection(),
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Review expiration tick completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Review expiration tick failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Review expiration worker error');
  });

  activeWorkers.push(worker);
  logger.info('Review expiration scheduler started (daily at 06:00 UTC)');
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

// ─── Conversation Cleanup Scheduler ──────────────────────────

let _cleanupQueue: Queue | null = null;
function getCleanupQueue(): Queue {
  if (!_cleanupQueue) _cleanupQueue = new Queue('conversation-cleanup', getConnection());
  return _cleanupQueue;
}

export async function startConversationCleanupScheduler(): Promise<void> {
  await getCleanupQueue().add(
    'cleanup-tick',
    {},
    {
      repeat: { pattern: '0 */1 * * *' }, // Every hour
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );

  const worker = new Worker(
    'conversation-cleanup',
    conversationCleanupProcessor,
    getConnection(),
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Conversation cleanup tick completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Conversation cleanup tick failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Conversation cleanup worker error');
  });

  activeWorkers.push(worker);
  logger.info('Conversation cleanup scheduler started (every hour, closes after 48h idle)');
}

/** Gracefully stop all workers, waiting for in-flight jobs to finish */
export async function stopAllWorkers(): Promise<void> {
  logger.info(`Stopping ${activeWorkers.length} worker(s)...`);
  await Promise.all(activeWorkers.map((w) => w.close()));
  activeWorkers.length = 0;
  logger.info('All workers stopped');
}
