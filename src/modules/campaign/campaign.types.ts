import { z } from 'zod';

// ── Job Data ────────────────────────────────────────────────

export interface CampaignSendJobData {
  campaignId: string;
  campaignContactId: string;
  tenantId: string;
  contactId: string;
  phone: string;
  contactName: string | null;
  messageTemplate: string;
}

// ── Analytics ───────────────────────────────────────────────

export interface CampaignAnalytics {
  campaignId: string;
  name: string;
  status: string;
  targetCount: number;
  sentCount: number;
  replyCount: number;
  qualifiedCount: number;
  bookedCount: number;
  pendingCount: number;
  failedCount: number;
  optedOutCount: number;
  replyRate: number;
  qualifiedRate: number;
  bookedRate: number;
}

// ── Zod Schemas ─────────────────────────────────────────────

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  messageTemplate: z.string().min(1).max(2000),
  sendRatePerDay: z.number().int().min(1).max(200).default(20),
  scheduledStart: z.string().datetime().optional(),
});

export const addContactsSchema = z
  .object({
    phones: z.array(z.string().min(10).max(20)).optional(),
    tags: z.array(z.string()).optional(),
  })
  .refine(
    (data) => (data.phones && data.phones.length > 0) || (data.tags && data.tags.length > 0),
    { message: 'Either phones or tags must be provided' },
  );

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type AddContactsInput = z.infer<typeof addContactsSchema>;
