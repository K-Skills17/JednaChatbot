import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import crypto from 'crypto';
import { env } from './env';

// Lazy singleton — PrismaClient is only created when first accessed,
// not at module import time. This lets the app boot for health checks
// even when DATABASE_URL is not configured.

let _prisma: PrismaClient | null = null;
let _extended: any = null;

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
    _prisma = new PrismaClient({ adapter });

    // Prisma 7 + adapter-pg generates client-side UUIDs with colons.
    // This extension injects a proper UUID via crypto.randomUUID()
    // before every create/upsert so Prisma never generates a bad one.
    _extended = _prisma.$extends({
      query: {
        $allModels: {
          create({ args, query }: any) {
            if (args.data && !args.data.id) {
              args.data.id = crypto.randomUUID();
            }
            return query(args);
          },
          createMany({ args, query }: any) {
            if (Array.isArray(args.data)) {
              for (const item of args.data) {
                if (!item.id) item.id = crypto.randomUUID();
              }
            }
            return query(args);
          },
          upsert({ args, query }: any) {
            if (args.create && !args.create.id) {
              args.create.id = crypto.randomUUID();
            }
            return query(args);
          },
        },
      },
    });
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
