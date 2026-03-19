/**
 * One-off script to add widgetConfig to the existing LK tenant.
 * Run with: npx tsx scripts/update-widget-config.ts
 */
import { PrismaClient } from '../src/generated/prisma';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

const TENANT_ID = '38610ffd-cb80-4938-8b3b-be6230991592';

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID } });

  if (!tenant) {
    // If hardcoded ID doesn't exist, find by WhatsApp number
    const byPhone = await prisma.tenant.findFirst({
      where: { whatsappNumber: '5511959041799' },
    });
    if (!byPhone) {
      console.error('No tenant found. Run seed-tenant.ts first.');
      process.exit(1);
    }
    console.log(`Found tenant by phone: ${byPhone.id}`);
    await updateTenant(byPhone.id, byPhone.aiConfig as Record<string, any>);
    return;
  }

  await updateTenant(tenant.id, tenant.aiConfig as Record<string, any>);
}

async function updateTenant(id: string, existingConfig: Record<string, any>) {
  const updated = await prisma.tenant.update({
    where: { id },
    data: {
      aiConfig: {
        ...existingConfig,
        widgetConfig: {
          primaryColor: '#c5a368',
          headerTitle: 'LK Digital',
          welcomeMessage: 'Olá! Como posso ajudar?',
          position: 'bottom-right',
        },
      },
    },
  });

  console.log('widgetConfig updated successfully!');
  console.log('Tenant:', updated.businessName, `(${updated.id})`);
  const cfg = updated.aiConfig as Record<string, any>;
  console.log('widgetConfig:', JSON.stringify(cfg.widgetConfig, null, 2));
}

main()
  .catch((err) => {
    console.error('Update failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
