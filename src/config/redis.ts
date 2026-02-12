import Redis from 'bullmq/node_modules/ioredis';
import { env } from './env';

// Lazy singleton — Redis client is only created when first accessed,
// not at module import time. This lets the app boot for health checks
// even when REDIS_URL is not configured or unreachable.

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    if (!env.REDIS_URL) {
      throw new Error('REDIS_URL is not configured');
    }
    _redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
    });
    _redis.on('connect', () => console.log('Redis connected'));
    _redis.on('error', (err: Error) => console.error('Redis error:', err.message));
  }
  return _redis;
}

export const redis: Redis = new Proxy({} as Redis, {
  get(_target, prop, receiver) {
    return Reflect.get(getRedis(), prop, receiver);
  },
});

export async function disconnectRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    console.log('Redis disconnected');
  }
}
