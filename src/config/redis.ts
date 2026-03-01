import { env } from './env';

// Lazy singleton — Redis client is only created when first accessed,
// not at module import time. This lets the app boot for health checks
// even when REDIS_URL is not configured or unreachable.

let _redis: any = null;

export function getRedis(): any {
  if (!_redis) {
    if (!env.REDIS_URL) {
      throw new Error('REDIS_URL is not configured');
    }
    // Require ioredis lazily so the module can be imported without crashing
    // when ioredis is only available as a nested dep of bullmq.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const IORedis = require('ioredis');
    _redis = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
    });
    _redis.on('connect', () => console.log('Redis connected'));
    _redis.on('error', (err: Error) => console.error('Redis error:', err.message));
  }
  return _redis;
}

export const redis: any = new Proxy({} as any, {
  get(_target: any, prop: string | symbol, receiver: any) {
    return Reflect.get(getRedis(), prop, receiver);
  },
});

export async function disconnectRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    console.log('Redis disconnected');
  }
}
