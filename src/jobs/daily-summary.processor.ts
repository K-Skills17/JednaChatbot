import { Job } from 'bullmq';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { analyticsService } from '../modules/analytics/analytics.service';
import { notificationService } from '../modules/notification/notification.service';

/**
 * Daily summary processor — runs once per day.
 * For each active tenant with notification config, generates a daily
 * report and sends it via the configured channels (Telegram/email/webhook).
 */
export async function dailySummaryProcessor(_job: Job): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: { status: 'active' },
    select: {
      id: true,
      businessName: true,
      notificationConfig: true,
      aiConfig: true,
    },
  });

  let sent = 0;

  for (const tenant of tenants) {
    try {
      const notifyConfig = getNotifyConfig(tenant);
      if (!notifyConfig?.dailySummary) continue;

      const overview = await analyticsService.getOverview(tenant.id);
      const dailyMetrics = await analyticsService.getDailyMetrics(tenant.id, 1);
      const today = dailyMetrics[0];

      const report = formatReport(tenant.businessName, overview, today);

      // Send to all configured channels
      if (notifyConfig.telegramChatId) {
        await notificationService.notify({
          tenantId: tenant.id,
          type: 'daily_summary',
          channel: 'telegram',
          recipient: notifyConfig.telegramChatId,
          content: report,
        });
      }

      if (notifyConfig.ownerEmail) {
        await notificationService.notify({
          tenantId: tenant.id,
          type: 'daily_summary',
          channel: 'email',
          recipient: notifyConfig.ownerEmail,
          content: report,
        });
      }

      if (notifyConfig.webhookUrl) {
        await notificationService.notify({
          tenantId: tenant.id,
          type: 'daily_summary',
          channel: 'webhook',
          recipient: notifyConfig.webhookUrl,
          content: report,
        });
      }

      sent++;
    } catch (err) {
      logger.error({ err, tenantId: tenant.id }, 'Failed to send daily summary for tenant');
    }
  }

  logger.info({ tenantsProcessed: tenants.length, summariesSent: sent }, 'Daily summary job completed');
}

function getNotifyConfig(tenant: any): any {
  if (tenant.notificationConfig && typeof tenant.notificationConfig === 'object') {
    return tenant.notificationConfig;
  }
  return (tenant.aiConfig as any)?.notifications ?? null;
}

function formatReport(
  businessName: string,
  overview: Awaited<ReturnType<typeof analyticsService.getOverview>>,
  today?: { newContacts: number; messagesIn: number; messagesOut: number; bookings: number },
): string {
  const lines: string[] = [
    `📊 *Resumo Diário — ${businessName}*`,
    '',
  ];

  if (today) {
    lines.push('*Hoje:*');
    lines.push(`• Novos contatos: ${today.newContacts}`);
    lines.push(`• Mensagens recebidas: ${today.messagesIn}`);
    lines.push(`• Mensagens enviadas: ${today.messagesOut}`);
    lines.push(`• Agendamentos: ${today.bookings}`);
    lines.push('');
  }

  lines.push('*Visão Geral:*');
  lines.push(`• Contatos: ${overview.contacts.total} (${overview.contacts.qualifying} qualificando, ${overview.contacts.qualified} qualificados, ${overview.contacts.booked} agendados)`);
  lines.push(`• Conversas ativas: ${overview.conversations.active}`);
  lines.push(`• Escalações: ${overview.conversations.escalated}`);
  lines.push(`• Agendamentos próximos: ${overview.bookings.upcoming}`);

  if (overview.campaigns.active > 0) {
    lines.push('');
    lines.push('*Campanhas:*');
    lines.push(`• Ativas: ${overview.campaigns.active}`);
    lines.push(`• Enviadas: ${overview.campaigns.totalSent}`);
    lines.push(`• Taxa de resposta: ${(overview.campaigns.overallReplyRate * 100).toFixed(1)}%`);
  }

  return lines.join('\n');
}
