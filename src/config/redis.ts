import Redis from 'bullmq/node_modules/ioredis';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
});

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err: Error) => console.error('Redis error:', err.message));

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  console.log('Redis disconnected');
}
