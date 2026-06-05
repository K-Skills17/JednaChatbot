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

/** Replace Prisma-generated UUIDs that contain colons (adapter-pg bug) */
function fixId(data: Record<string, any>): void {
  if (!data.id || (typeof data.id === 'string' && data.id.includes(':'))) {
    data.id = crypto.randomUUID();
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
    _prisma = new PrismaClient({ adapter });

    // Prisma 7 + adapter-pg generates client-side UUIDs with colons.
    // The @default(uuid()) is applied BEFORE extension hooks run, so
    // args.data.id is already set to a bad UUID. We must detect and replace it.
    _extended = (_prisma as any).$extends({
      query: {
        $allModels: {
          async create({ args, query }: any) {
            if (args.data) {
              fixId(args.data);
            }
            return query(args);
          },
          async createMany({ args, query }: any) {
            if (Array.isArray(args.data)) {
              for (const item of args.data) {
                fixId(item);
              }
            }
            return query(args);
          },
          async upsert({ args, query }: any) {
            if (args.create) {
              fixId(args.create);
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
