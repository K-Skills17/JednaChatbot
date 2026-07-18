import { Job } from 'bullmq';
import axios from 'axios';
import nodemailer from 'nodemailer';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { env } from '../config/env';

interface NotificationJobData {
  notificationId: string;
  tenantId: string;
  type: string;
  channel: 'telegram' | 'email' | 'webhook' | 'sms';
  recipient: string;
  content: string;
}

export async function notificationProcessor(job: Job<NotificationJobData>): Promise<void> {
  const { notificationId, channel, recipient, content } = job.data;

  try {
    switch (channel) {
      case 'telegram':
        await sendTelegramNotification(recipient, content);
        break;
      case 'email':
        await sendEmailNotification(recipient, job.data.type, content);
        break;
      case 'webhook':
        await sendWebhookNotification(recipient, job.data);
        break;
      case 'sms':
        // SMS notifications are not used for owner alerts (Telegram is primary)
        logger.warn({ channel }, 'SMS notification channel not implemented for owner alerts');
        break;
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'sent', sentAt: new Date() },
    });

    logger.info({ notificationId, channel, recipient }, 'Notification sent');
  } catch (err) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'failed' },
    });

    logger.error({ err, notificationId, channel }, 'Notification failed');
    throw err; // Let BullMQ retry
  }
}

async function sendTelegramNotification(chatId: string, content: string): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn('Telegram notification skipped — TELEGRAM_BOT_TOKEN not set');
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await axios.post(url, {
    chat_id: chatId,
    text: content,
    parse_mode: 'Markdown',
  }, { timeout: 10000 });

  if (!res.data?.ok) {
    throw new Error(`Telegram API returned ok=false: ${JSON.stringify(res.data)}`);
  }
}

async function sendEmailNotification(
  to: string,
  type: string,
  content: string,
): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT ?? '587', 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    logger.warn('Email notification skipped — SMTP not configured');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const subjectMap: Record<string, string> = {
    new_lead: 'New Lead Received',
    booking: 'New Appointment Booked',
    escalation: 'Lead Ready for Follow-Up',
    daily_summary: 'Daily Practice Summary',
  };

  await transporter.sendMail({
    from: smtpUser,
    to,
    subject: subjectMap[type] ?? 'Notification',
    text: content,
  });
}

async function sendWebhookNotification(
  url: string,
  data: NotificationJobData,
): Promise<void> {
  await axios.post(url, {
    event: data.type,
    tenantId: data.tenantId,
    content: data.content,
    timestamp: new Date().toISOString(),
  }, { timeout: 10000 });
}
