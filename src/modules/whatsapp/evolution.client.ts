import axios, { AxiosInstance } from 'axios';
import { evolutionConfig } from '../../config/evolution';
import { logger } from '../../utils/logger';

export interface EvolutionInstance {
  instanceName: string;
  instanceId: string;
  status: string;
}

export interface SendTextPayload {
  number: string;
  text: string;
  delay?: number; // ms delay before sending (simulate typing)
}

export interface SendButtonPayload {
  number: string;
  title: string;
  description: string;
  footer?: string;
  buttons: Array<{ buttonText: string; buttonId: string }>;
}

export interface SendListPayload {
  number: string;
  title: string;
  description: string;
  buttonText: string;
  footerText?: string;
  sections: Array<{
    title: string;
    rows: Array<{ title: string; description?: string; rowId: string }>;
  }>;
}

/**
 * Evolution API v2 client wrapper.
 * Docs: https://doc.evolution-api.com/v2
 */
export class EvolutionClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: evolutionConfig.baseUrl,
      headers: {
        apikey: evolutionConfig.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });
  }

  // ─── Instance Management ─────────────────────────────────

  /** Create a new WhatsApp instance for a tenant */
  async createInstance(instanceName: string): Promise<EvolutionInstance> {
    const { data } = await this.http.post('/instance/create', {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      webhook: {
        url: evolutionConfig.webhookUrl,
        byEvents: false,
        base64: false,
        events: [
          'messages.upsert',
          'messages.update',
          'connection.update',
          'qrcode.updated',
        ],
      },
    });

    logger.info({ instanceName }, 'Evolution instance created');
    return data;
  }

  /** Get connection status of an instance */
  async getInstanceStatus(instanceName: string): Promise<{ state: string }> {
    const { data } = await this.http.get(
      `/instance/connectionState/${instanceName}`,
    );
    return data;
  }

  /** Connect instance (triggers QR code) */
  async connectInstance(instanceName: string): Promise<{ code: string; base64: string }> {
    const { data } = await this.http.get(`/instance/connect/${instanceName}`);
    return data;
  }

  /** Disconnect / logout instance */
  async logoutInstance(instanceName: string): Promise<void> {
    await this.http.delete(`/instance/logout/${instanceName}`);
    logger.info({ instanceName }, 'Evolution instance logged out');
  }

  /** Delete instance entirely */
  async deleteInstance(instanceName: string): Promise<void> {
    await this.http.delete(`/instance/delete/${instanceName}`);
    logger.info({ instanceName }, 'Evolution instance deleted');
  }

  /** List all instances */
  async listInstances(): Promise<EvolutionInstance[]> {
    const { data } = await this.http.get('/instance/fetchInstances');
    return data;
  }

  // ─── Messaging ───────────────────────────────────────────

  /** Send a plain text message */
  async sendText(instanceName: string, payload: SendTextPayload): Promise<any> {
    const { data } = await this.http.post(
      `/message/sendText/${instanceName}`,
      {
        number: payload.number,
        text: payload.text,
        delay: payload.delay ?? 1500, // default 1.5s delay
      },
    );

    logger.debug({ instanceName, to: payload.number }, 'Text message sent');
    return data;
  }

  /** Send interactive button message */
  async sendButtons(instanceName: string, payload: SendButtonPayload): Promise<any> {
    const { data } = await this.http.post(
      `/message/sendButtons/${instanceName}`,
      payload,
    );
    return data;
  }

  /** Send interactive list message */
  async sendList(instanceName: string, payload: SendListPayload): Promise<any> {
    const { data } = await this.http.post(
      `/message/sendList/${instanceName}`,
      payload,
    );
    return data;
  }

  /** Send a media message (image, document, audio) */
  async sendMedia(
    instanceName: string,
    number: string,
    mediaType: 'image' | 'document' | 'audio' | 'video',
    mediaUrl: string,
    caption?: string,
  ): Promise<any> {
    const { data } = await this.http.post(
      `/message/sendMedia/${instanceName}`,
      {
        number,
        mediatype: mediaType,
        media: mediaUrl,
        caption,
      },
    );
    return data;
  }

  // ─── Webhook Configuration ──────────────────────────────

  /** Set webhook URL for an instance */
  async setWebhook(instanceName: string, webhookUrl: string): Promise<void> {
    await this.http.post(`/webhook/set/${instanceName}`, {
      url: webhookUrl,
      webhook_by_events: false,
      webhook_base64: false,
      events: [
        'messages.upsert',
        'messages.update',
        'connection.update',
      ],
    });

    logger.info({ instanceName, webhookUrl }, 'Webhook configured');
  }
}

// Singleton
export const evolutionClient = new EvolutionClient();
