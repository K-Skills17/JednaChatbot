/**
 * One-time script to add facebookPageId to the tenant's aiConfig.
 * Run with: npx tsx scripts/add-facebook-page-id.ts
 */
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const FACEBOOK_PAGE_ID = '617830531423137';
const WHATSAPP_NUMBER = '5511959041799';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sep = dbUrl.includes('?') ? '&' : '?';
  const url = `${dbUrl}${sep}schema=lk_chatbot`;
  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool, { schema: 'lk_chatbot' });
  const prisma = new PrismaClient({ adapter });

  const tenant = await prisma.tenant.findFirst({
    where: { whatsappNumber: WHATSAPP_NUMBER },
  });

  if (!tenant) {
    console.error('Tenant not found with phone:', WHATSAPP_NUMBER);
    process.exit(1);
  }

  console.log(`Found tenant: ${tenant.businessName} (${tenant.id})`);

  const currentAiConfig = (tenant.aiConfig as Record<string, any>) ?? {};

  if (currentAiConfig.facebookPageId === FACEBOOK_PAGE_ID) {
    console.log('facebookPageId is already set correctly. Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      aiConfig: {
        ...currentAiConfig,
        facebookPageId: FACEBOOK_PAGE_ID,
      },
    },
  });

  const updatedConfig = updated.aiConfig as Record<string, any>;
  console.log('');
  console.log('Updated aiConfig.facebookPageId =', updatedConfig.facebookPageId);
  console.log('Done!');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
