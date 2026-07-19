import crypto from 'crypto';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';
import { getNotificationQueue } from '../../jobs/queue.setup';

export type NotificationType = 'new_lead' | 'booking' | 'escalation' | 'daily_summary';
export type NotificationChannel = 'telegram' | 'email' | 'webhook' | 'sms';

interface NotifyInput {
  tenantId: string;
  type: NotificationType;
  channel: NotificationChannel;
  recipient: string;
  content: string;
}

export class NotificationService {
  /** Create and enqueue a notification */
  async notify(input: NotifyInput): Promise<void> {
    const notification = await prisma.notification.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        type: input.type,
        channel: input.channel,
        recipient: input.recipient,
        content: input.content,
        status: 'pending',
      },
    });

    await getNotificationQueue().add('send-notification', {
      notificationId: notification.id,
      tenantId: input.tenantId,
      type: input.type,
      channel: input.channel,
      recipient: input.recipient,
      content: input.content,
    });

    logger.debug({ notificationId: notification.id, type: input.type }, 'Notification enqueued');
  }

  /** Send notifications for a new lead event */
  async notifyNewLead(
    tenantId: string,
    contactName: string,
    phone: string,
    extra?: { email?: string; problem?: string },
  ): Promise<void> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return;

    const notifyConfig = getNotifyConfig(tenant);
    if (!notifyConfig?.newLead) return;

    const lines = [`🔔 New web lead: ${contactName || 'Unknown'}`];
    if (extra?.email) lines.push(`📧 Email: ${extra.email}`);
    if (phone && !phone.startsWith('web-')) lines.push(`📱 Phone: ${phone}`);
    if (extra?.problem) lines.push(`💬 Problem: ${extra.problem}`);
    lines.push(`📅 Sent booking link`);

    await this.sendToOwnerChannels(tenantId, 'new_lead', lines.join('\n'), notifyConfig);
  }

  /** Send notifications for a booking event */
  async notifyBooking(
    tenantId: string,
    contactName: string,
    scheduledAt: Date,
  ): Promise<void> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return;

    const notifyConfig = getNotifyConfig(tenant);
    if (!notifyConfig?.booking) return;

    const dateStr = scheduledAt.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const content = `New appointment booked!\nPatient: ${contactName}\nDate: ${dateStr}`;
    await this.sendToOwnerChannels(tenantId, 'booking', content, notifyConfig);
  }

  /** Send notifications for an escalation / handoff event */
  async notifyEscalation(
    tenantId: string,
    contactName: string,
    phone: string,
    reason?: string,
    leadContext?: { extractedData?: Record<string, any>; messageCount?: number },
  ): Promise<void> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return;

    const notifyConfig = getNotifyConfig(tenant);
    if (!notifyConfig?.escalation) return;

    const content = buildHandoffMessage(contactName, phone, reason, leadContext);
    await this.sendToOwnerChannels(tenantId, 'escalation', content, notifyConfig);

    // Also POST to TELEGRAM_BOT_WEBHOOK if configured (primary handoff channel)
    await sendTelegramHandoff(content, phone, leadContext);
  }

  /** List notifications for a tenant */
  async listByTenant(tenantId: string, options?: { type?: string; limit?: number }) {
    return prisma.notification.findMany({
      where: {
        tenantId,
        ...(options?.type ? { type: options.type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
    });
  }

  private async sendToOwnerChannels(
    tenantId: string,
    type: NotificationType,
    content: string,
    notifyConfig: any,
  ): Promise<void> {
    // Telegram notification (primary)
    if (notifyConfig.telegramChatId || env.TELEGRAM_CHAT_ID) {
      await this.notify({
        tenantId,
        type,
        channel: 'telegram',
        recipient: notifyConfig.telegramChatId ?? env.TELEGRAM_CHAT_ID!,
        content,
      });
    }

    // Email notification
    if (notifyConfig.ownerEmail) {
      await this.notify({
        tenantId,
        type,
        channel: 'email',
        recipient: notifyConfig.ownerEmail,
        content,
      });
    }

    // Webhook notification
    if (notifyConfig.webhookUrl) {
      await this.notify({
        tenantId,
        type,
        channel: 'webhook',
        recipient: notifyConfig.webhookUrl,
        content,
      });
    }
  }
}

/**
 * Build a structured handoff message for the Telegram notification.
 * This is what the practice staff sees when a lead is ready for follow-up.
 */
function buildHandoffMessage(
  contactName: string,
  phone: string,
  reason?: string,
  leadContext?: { extractedData?: Record<string, any>; messageCount?: number },
): string {
  const lines: string[] = [];

  lines.push('🦷 *New Jedna LLC Lead*');
  lines.push('');

  const name = contactName || leadContext?.extractedData?.name;
  if (name) lines.push(`*Name:* ${name}`);
  lines.push(`*Phone:* ${phone}`);

  const msgCount = leadContext?.messageCount;
  if (msgCount != null) {
    const engagement = msgCount >= 6
      ? 'High (completed full flow)'
      : msgCount >= 3
      ? 'Medium'
      : 'Low (few messages)';
    lines.push(`*Engagement:* ${engagement} — ${msgCount} exchanges`);
  }

  const data = leadContext?.extractedData ?? {};
  const skipKeys = new Set(['_reasoning', 'source', 'auditReportSent']);
  const labelMap: Record<string, string> = {
    name: 'Name',
    email: 'Email',
    treatment_need: 'Treatment need',
    timeline: 'Timeline',
    preferred_day: 'Preferred day',
    preferred_period: 'Preferred time',
    prior_patient: 'Prior patient',
    location_ok: 'Location OK',
    current_situation: 'Current situation',
  };

  const qualLines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (skipKeys.has(key) || key.startsWith('_') || !value) continue;
    const label = labelMap[key] ?? key.replace(/_/g, ' ');
    qualLines.push(`• *${label}:* ${value}`);
  }

  if (qualLines.length > 0) {
    lines.push('');
    lines.push('*Collected in chat:*');
    lines.push(...qualLines);
  }

  if (reason) {
    lines.push('');
    lines.push(`*Handoff reason:* ${reason}`);
  }

  lines.push('');
  lines.push('_Reply to this message to start the follow-up._');

  return lines.join('\n');
}

/**
 * POST the handoff payload directly to TELEGRAM_BOT_WEBHOOK.
 * This is the primary notification path for practice staff.
 */
async function sendTelegramHandoff(
  message: string,
  phone: string,
  leadContext?: { extractedData?: Record<string, any> },
): Promise<void> {
  const webhookUrl = env.TELEGRAM_BOT_WEBHOOK;
  if (!webhookUrl) return;

  try {
    const payload = {
      event: 'lead_handoff',
      timestamp: new Date().toISOString(),
      phone,
      message,
      qualificationData: leadContext?.extractedData ?? {},
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      logger.warn({ status: res.status, webhookUrl }, 'Telegram handoff webhook returned non-OK status');
    } else {
      logger.info({ phone }, 'Handoff sent to Telegram webhook');
    }
  } catch (err) {
    logger.error({ err, phone }, 'Failed to POST handoff to Telegram webhook');
  }
}

function getNotifyConfig(tenant: any): any {
  if (tenant.notificationConfig && typeof tenant.notificationConfig === 'object') {
    return tenant.notificationConfig;
  }
  return (tenant.aiConfig as any)?.notifications ?? null;
}

export const notificationService = new NotificationService();
