import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Allow app to boot for health checks during initial Railway setup
// Set SKIP_ENV_VALIDATION=true in Railway to pass first deploy, then remove it
if (process.env.SKIP_ENV_VALIDATION === 'true') {
  console.warn('SKIP_ENV_VALIDATION is set — using placeholder config. Set real env vars and redeploy.');
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_KEY: z.string().min(1),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  EVOLUTION_API_URL: z.string().url(),
  EVOLUTION_API_KEY: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AI_PRIMARY_PROVIDER: z.enum(['claude', 'openai']).default('claude'),
  AI_PRIMARY_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  AI_QUALIFICATION_MODEL: z.string().default('claude-sonnet-4-5-20250929'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  WEBHOOK_BASE_URL: z.string().url().default('http://localhost:3000'),
});

function loadEnv() {
  if (process.env.SKIP_ENV_VALIDATION === 'true') {
    return {
      NODE_ENV: 'production' as const,
      PORT: 3000,
      API_KEY: 'setup-pending',
      DATABASE_URL: '',
      REDIS_URL: '',
      EVOLUTION_API_URL: '',
      EVOLUTION_API_KEY: '',
      AI_PRIMARY_PROVIDER: 'claude' as const,
      AI_PRIMARY_MODEL: 'claude-haiku-4-5-20251001',
      AI_QUALIFICATION_MODEL: 'claude-sonnet-4-5-20250929',
      WEBHOOK_BASE_URL: 'http://localhost:3000',
    };
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
