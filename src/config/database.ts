import { PrismaClient } from '../generated/prisma/client';
import { env } from './env';

// Lazy singleton — PrismaClient is only created when first accessed,
// not at module import time. This lets the app boot for health checks
// even when DATABASE_URL is not configured.

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not configured');
    }
    // Append schema=lk_chatbot so our tables don't collide with Evolution API's public schema
    const sep = env.DATABASE_URL.includes('?') ? '&' : '?';
    const url = `${env.DATABASE_URL}${sep}schema=lk_chatbot`;
    _prisma = new PrismaClient({
      datasourceUrl: url,
    });
  }
  return _prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrisma(), prop, receiver);
  },
});

export async function connectDatabase(): Promise<void> {
  await getPrisma().$queryRawUnsafe('SELECT 1');
  console.log('Database connected');
}

export async function disconnectDatabase(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    console.log('Database disconnected');
  }
}
