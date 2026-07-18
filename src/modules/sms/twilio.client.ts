import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export interface SmsSendOptions {
  to: string;     // E.164 format: +1XXXXXXXXXX
  body: string;
}

export interface SmsSendResult {
  sid: string;
  status: string;
}

/**
 * Twilio SMS client — drop-in replacement for the Evolution WhatsApp client.
 * Enforces 300-character limit per TCPA best-practice and A2P 10DLC requirements.
 */
class TwilioSmsClient {
  private client: any = null;

  private getClient() {
    if (this.client) return this.client;

    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
      throw new Error('Twilio credentials not configured — set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
    }

    // Lazy-load twilio so the app can boot without credentials (dev/health check)
    const twilio = require('twilio');
    this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    return this.client;
  }

  /** Send an SMS message. Enforces 300-char limit and logs the SID. */
  async sendText(to: string, body: string): Promise<SmsSendResult> {
    if (!env.TWILIO_FROM_NUMBER) {
      throw new Error('TWILIO_FROM_NUMBER not configured');
    }

    // Hard-cap at 300 chars — SMS best practice; carrier long-message splitting degrades UX
    const safeBody = body.length > 300 ? body.slice(0, 297) + '...' : body;

    // Normalize recipient to E.164 if bare 10-digit US number
    const normalizedTo = normalizeUsPhone(to);

    const client = this.getClient();
    const message = await client.messages.create({
      from: env.TWILIO_FROM_NUMBER,
      to: normalizedTo,
      body: safeBody,
    });

    logger.info({ sid: message.sid, to: normalizedTo, chars: safeBody.length }, 'SMS sent via Twilio');
    return { sid: message.sid, status: message.status };
  }

  /** Basic health check — verifies credentials by fetching account info */
  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      const client = this.getClient();
      await client.api.accounts(env.TWILIO_ACCOUNT_SID).fetch();
      return { ok: true, detail: 'Twilio reachable' };
    } catch (err: any) {
      return { ok: false, detail: err?.message ?? 'Twilio health check failed' };
    }
  }
}

/**
 * Normalize a US phone number to E.164.
 * Handles: "8005551234", "1-800-555-1234", "+18005551234", "(800) 555-1234"
 */
export function normalizeUsPhone(phone: string): string {
  // If already E.164
  if (/^\+1\d{10}$/.test(phone)) return phone;

  // Strip everything non-digit
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  // Return as-is and let Twilio validate — don't crash on international numbers
  return phone.startsWith('+') ? phone : `+${digits}`;
}

export const twilioClient = new TwilioSmsClient();
