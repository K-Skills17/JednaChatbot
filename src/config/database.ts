import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import crypto from 'crypto';
import { env } from './env';
import { logger } from '../utils/logger';

// Lazy singleton — PrismaClient is only created when first accessed,
// not at module import time. This lets the app boot for health checks
// even when DATABASE_URL is not configured.

let _prisma: PrismaClient | null = null;
let _extended: any = null;

/** Replace any ID that is missing or contains colons (Prisma adapter-pg bug) */
function safeId(data: Record<string, any>): void {
  const existing = data.id;
  if (!existing || (typeof existing === 'string' && existing.includes(':'))) {
    const newId = crypto.randomUUID();
    logger.debug({ oldId: existing, newId }, 'UUID extension: replacing ID');
    data.id = newId;
  }
}

function getPrisma(): any {
  if (!_extended) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not configured');
    }
    // Use lk_chatbot schema so we don't collide with Evolution API's public schema
    const sep = env.DATABASE_URL.includes('?') ? '&' : '?';
    const url = `${env.DATABASE_URL}${sep}schema=lk_chatbot`;
    const pool = new Pool({ connectionString: url });
    const adapter = new PrismaPg(pool, { schema: 'lk_chatbot' });
    _prisma = new PrismaClient({ adapter }) as any;

    // Prisma 7 + adapter-pg generates client-side UUIDs with colons.
    // This extension intercepts every create/upsert and replaces bad UUIDs.
    _extended = (_prisma as any).$extends({
      query: {
        $allModels: {
          async create({ args, query }: any) {
            if (args.data) safeId(args.data);
            return query(args);
          },
          async createMany({ args, query }: any) {
            if (Array.isArray(args.data)) {
              for (const item of args.data) safeId(item);
            }
            return query(args);
          },
          async upsert({ args, query }: any) {
            if (args.create) safeId(args.create);
            return query(args);
          },
        },
      },
    });

    logger.info('Prisma client initialized with UUID-safe extension');
  }
  return _extended;
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
