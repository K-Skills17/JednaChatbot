import { Job } from 'bullmq';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { getCampaignQueue } from './queue.setup';
import { isWithinBusinessHours } from '../utils/timezone.utils';
import { CampaignSendJobData } from '../modules/campaign/campaign.types';

const SCHEDULER_INTERVAL_MINUTES = 5;
// ~120 batches in a 10-hour business day (08:00-18:00)
const BATCHES_PER_DAY = (10 * 60) / SCHEDULER_INTERVAL_MINUTES;

export async function campaignSchedulerProcessor(job: Job): Promise<void> {
  logger.debug({ jobId: job.id }, 'Campaign scheduler tick');

  const activeCampaigns = await prisma.campaign.findMany({
    where: { status: 'active' },
    include: { tenant: true },
  });

  for (const campaign of activeCampaigns) {
    try {
      await processCampaignBatch(campaign);
    } catch (err) {
      logger.error({ err, campaignId: campaign.id }, 'Failed to process campaign batch');
    }
  }
}

async function processCampaignBatch(campaign: any): Promise<void> {
  const tenant = campaign.tenant;

  // Skip if scheduledStart is in the future
  if (campaign.scheduledStart && new Date(campaign.scheduledStart) > new Date()) {
    logger.debug({ campaignId: campaign.id }, 'Campaign start is in the future, skipping');
    return;
  }

  // Skip if outside business hours
  const businessHours = tenant.businessHours as { start: string; end: string; days: number[] };
  if (!isWithinBusinessHours(tenant.timezone, businessHours)) {
    logger.debug({ campaignId: campaign.id }, 'Outside business hours, skipping');
    return;
  }

  // Calculate batch size
  const batchSize = Math.max(1, Math.ceil(campaign.sendRatePerDay / BATCHES_PER_DAY));

  // Fetch pending contacts (skip opted-out)
  const pendingContacts = await prisma.campaignContact.findMany({
    where: {
      campaignId: campaign.id,
      status: 'pending',
      contact: { optedOut: false },
    },
    include: {
      contact: { select: { id: true, phone: true, name: true } },
    },
    take: batchSize,
  });

  if (pendingContacts.length === 0) {
    // Check if campaign should be completed
    const remainingPending = await prisma.campaignContact.count({
      where: { campaignId: campaign.id, status: 'pending' },
    });

    if (remainingPending === 0) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'completed' },
      });
      logger.info({ campaignId: campaign.id }, 'Campaign completed — all contacts processed');
    }
    return;
  }

  // Enqueue individual send jobs
  const jobs = pendingContacts.map((cc) => ({
    name: 'campaign-send',
    data: {
      campaignId: campaign.id,
      campaignContactId: cc.id,
      tenantId: campaign.tenantId,
      contactId: cc.contact.id,
      phone: cc.contact.phone,
      contactName: cc.contact.name,
      messageTemplate: campaign.messageTemplate,
    } as CampaignSendJobData,
    opts: {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 30000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }));

  await getCampaignQueue().addBulk(jobs);

  logger.info(
    { campaignId: campaign.id, batchSize: pendingContacts.length },
    'Campaign batch enqueued',
  );
}
