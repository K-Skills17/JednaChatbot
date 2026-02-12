import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { normalizeBrazilianPhone } from '../../utils/phone.utils';
import { CreateCampaignInput, AddContactsInput, CampaignAnalytics } from './campaign.types';

export class CampaignService {
  // ─── CRUD ───────────────────────────────────────────────────

  async create(tenantId: string, input: CreateCampaignInput) {
    const campaign = await prisma.campaign.create({
      data: {
        tenantId,
        name: input.name,
        messageTemplate: input.messageTemplate,
        sendRatePerDay: input.sendRatePerDay,
        scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : null,
        status: 'draft',
      },
    });

    logger.info({ campaignId: campaign.id, name: campaign.name }, 'Campaign created');
    return campaign;
  }

  async getById(campaignId: string, tenantId: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        _count: { select: { contacts: true } },
      },
    });

    if (!campaign || campaign.tenantId !== tenantId) return null;
    return campaign;
  }

  async listByTenant(tenantId: string) {
    return prisma.campaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Contact Management ─────────────────────────────────────

  async addContacts(
    campaignId: string,
    tenantId: string,
    input: AddContactsInput,
  ): Promise<{ added: number; skipped: number }> {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.tenantId !== tenantId) {
      throw new Error('Campaign not found');
    }

    // Step 1: Resolve contacts
    const contactIds: string[] = [];

    if (input.phones && input.phones.length > 0) {
      for (const rawPhone of input.phones) {
        const phone = normalizeBrazilianPhone(rawPhone);
        if (!phone) continue;

        const contact = await prisma.contact.upsert({
          where: { tenantId_phone: { tenantId, phone } },
          update: {},
          create: { tenantId, phone, leadStatus: 'new' },
        });
        contactIds.push(contact.id);
      }
    }

    if (input.tags && input.tags.length > 0) {
      const taggedContacts = await prisma.contact.findMany({
        where: {
          tenantId,
          tags: { hasSome: input.tags },
          optedOut: false,
        },
        select: { id: true },
      });
      contactIds.push(...taggedContacts.map((c) => c.id));
    }

    // Deduplicate
    const uniqueIds = [...new Set(contactIds)];

    // Step 2: Filter opted-out contacts
    const activeContacts = await prisma.contact.findMany({
      where: { id: { in: uniqueIds }, optedOut: false },
      select: { id: true },
    });
    const activeIds = new Set(activeContacts.map((c) => c.id));

    // Step 3: Filter already-in-campaign contacts
    const existing = await prisma.campaignContact.findMany({
      where: { campaignId, contactId: { in: [...activeIds] } },
      select: { contactId: true },
    });
    const existingIds = new Set(existing.map((cc) => cc.contactId));

    const newIds = [...activeIds].filter((id) => !existingIds.has(id));

    // Step 4: Bulk create CampaignContact records
    if (newIds.length > 0) {
      await prisma.campaignContact.createMany({
        data: newIds.map((contactId) => ({
          campaignId,
          contactId,
          status: 'pending',
        })),
        skipDuplicates: true,
      });
    }

    // Step 5: Update targetCount
    const totalContacts = await prisma.campaignContact.count({ where: { campaignId } });
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { targetCount: totalContacts },
    });

    const skipped = uniqueIds.length - newIds.length;
    logger.info({ campaignId, added: newIds.length, skipped }, 'Contacts added to campaign');

    return { added: newIds.length, skipped };
  }

  // ─── Lifecycle ──────────────────────────────────────────────

  async start(campaignId: string, tenantId: string): Promise<void> {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.tenantId !== tenantId) {
      throw new Error('Campaign not found');
    }
    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      throw new Error(`Cannot start campaign with status '${campaign.status}'`);
    }

    const pendingCount = await prisma.campaignContact.count({
      where: { campaignId, status: 'pending' },
    });
    if (pendingCount === 0) {
      throw new Error('Campaign has no pending contacts');
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'active' },
    });

    logger.info({ campaignId }, 'Campaign started');
  }

  async pause(campaignId: string, tenantId: string): Promise<void> {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.tenantId !== tenantId) {
      throw new Error('Campaign not found');
    }
    if (campaign.status !== 'active') {
      throw new Error(`Cannot pause campaign with status '${campaign.status}'`);
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'paused' },
    });

    logger.info({ campaignId }, 'Campaign paused');
  }

  // ─── Analytics ──────────────────────────────────────────────

  async getAnalytics(campaignId: string, tenantId: string): Promise<CampaignAnalytics> {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.tenantId !== tenantId) {
      throw new Error('Campaign not found');
    }

    const statusCounts = await prisma.campaignContact.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: true,
    });

    const countMap: Record<string, number> = {};
    for (const row of statusCounts) {
      countMap[row.status] = row._count;
    }

    const sentCount = campaign.sentCount;
    const replyCount = campaign.replyCount;
    const qualifiedCount = campaign.qualifiedCount;

    return {
      campaignId,
      name: campaign.name,
      status: campaign.status,
      targetCount: campaign.targetCount,
      sentCount,
      replyCount,
      qualifiedCount,
      bookedCount: campaign.bookedCount,
      pendingCount: countMap['pending'] ?? 0,
      failedCount: countMap['failed'] ?? 0,
      optedOutCount: countMap['opted_out'] ?? 0,
      replyRate: sentCount > 0 ? replyCount / sentCount : 0,
      qualifiedRate: replyCount > 0 ? qualifiedCount / replyCount : 0,
      bookedRate: qualifiedCount > 0 ? campaign.bookedCount / qualifiedCount : 0,
    };
  }

  // ─── Counter Helpers ────────────────────────────────────────

  async incrementReplyCount(campaignId: string): Promise<void> {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { replyCount: { increment: 1 } },
    });
  }

  async incrementQualifiedCount(campaignId: string): Promise<void> {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { qualifiedCount: { increment: 1 } },
    });
  }

  async incrementBookedCount(campaignId: string): Promise<void> {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { bookedCount: { increment: 1 } },
    });
  }
}

export const campaignService = new CampaignService();
