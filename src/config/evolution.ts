import { env } from './env';

export const evolutionConfig = {
  baseUrl: env.EVOLUTION_API_URL,
  apiKey: env.EVOLUTION_API_KEY,
  webhookUrl: `${env.WEBHOOK_BASE_URL}/webhook/evolution`,
};
