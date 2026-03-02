import { env } from './env';

/**
 * Normalize Evolution API URL for Railway public domains.
 * Railway public URLs (*.up.railway.app) are reverse-proxied on port 443.
 * Custom ports like :8080 are NOT exposed publicly — only the internal
 * container port is mapped to HTTPS/443 automatically.
 *
 * Example: http://evo.up.railway.app:8080 → https://evo.up.railway.app
 */
function normalizeEvolutionUrl(raw: string): string {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname.endsWith('.up.railway.app')) {
      url.protocol = 'https:';
      url.port = '';  // Railway public domain serves on 443, not custom ports
    }
    // Remove trailing slash for consistent base URL
    return url.toString().replace(/\/+$/, '');
  } catch {
    return raw;
  }
}

export const evolutionConfig = {
  baseUrl: normalizeEvolutionUrl(env.EVOLUTION_API_URL),
  apiKey: env.EVOLUTION_API_KEY,
  webhookUrl: `${env.WEBHOOK_BASE_URL}/webhook/evolution`,
};
