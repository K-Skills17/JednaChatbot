import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
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
    // Use lk_chatbot schema so we don't collide with Evolution API's public schema
    const sep = env.DATABASE_URL.includes('?') ? '&' : '?';
    const url = `${env.DATABASE_URL}${sep}schema=lk_chatbot`;
    const pool = new Pool({ connectionString: url });
    const adapter = new PrismaPg(pool, { schema: 'lk_chatbot' });
    _prisma = new PrismaClient({ adapter });
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
