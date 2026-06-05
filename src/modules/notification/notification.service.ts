import crypto from 'crypto';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { getNotificationQueue } from '../../jobs/queue.setup';

export type NotificationType = 'new_lead' | 'booking' | 'escalation' | 'daily_summary';
export type NotificationChannel = 'whatsapp' | 'email' | 'webhook';

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
  async notifyNewLead(tenantId: string, contactName: string, phone: string): Promise<void> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return;

    const notifyConfig = getNotifyConfig(tenant);
    if (!notifyConfig?.newLead) return;

    const content = `Novo lead: ${contactName || phone}\nTelefone: ${phone}`;

    await this.sendToOwnerChannels(tenantId, 'new_lead', content, notifyConfig);
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

    const dateStr = scheduledAt.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const content = `Novo agendamento!\nCliente: ${contactName}\nData: ${dateStr}`;

    await this.sendToOwnerChannels(tenantId, 'booking', content, notifyConfig);
  }

  /** Send notifications for an escalation event */
  async notifyEscalation(
    tenantId: string,
    contactName: string,
    phone: string,
    reason?: string,
  ): Promise<void> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return;

    const notifyConfig = getNotifyConfig(tenant);
    if (!notifyConfig?.escalation) return;

    const content = `Atendimento escalado!\nCliente: ${contactName || phone}\nTelefone: ${phone}${reason ? `\nMotivo: ${reason}` : ''}`;

    await this.sendToOwnerChannels(tenantId, 'escalation', content, notifyConfig);
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

  /** Route notification to all configured owner channels */
  private async sendToOwnerChannels(
    tenantId: string,
    type: NotificationType,
    content: string,
    notifyConfig: any,
  ): Promise<void> {
    // WhatsApp notification to owner
    if (notifyConfig.ownerPhone) {
      await this.notify({
        tenantId,
        type,
        channel: 'whatsapp',
        recipient: notifyConfig.ownerPhone,
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
 * Extract notification config from the correct tenant field.
 * Checks `notificationConfig` (the dedicated field) first,
 * then falls back to `aiConfig.notifications` for backward compatibility.
 */
function getNotifyConfig(tenant: any): any {
  // Primary: dedicated notificationConfig column
  if (tenant.notificationConfig && typeof tenant.notificationConfig === 'object') {
    return tenant.notificationConfig;
  }
  // Fallback: nested inside aiConfig (legacy)
  return (tenant.aiConfig as any)?.notifications ?? null;
}

export const notificationService = new NotificationService();
