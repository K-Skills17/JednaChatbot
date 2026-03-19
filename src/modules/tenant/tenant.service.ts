import crypto from 'crypto';
import { prisma } from '../../config/database';
import { evolutionClient } from '../whatsapp/evolution.client';
import { evolutionConfig } from '../../config/evolution';
import { logger } from '../../utils/logger';
import { normalizeBrazilianPhone } from '../../utils/phone.utils';
import { CreateTenantInput, UpdateTenantInput } from './tenant.schema';

export class TenantService {
  /** Create a new tenant and optionally provision an Evolution API instance */
  async create(input: CreateTenantInput) {
    let normalizedPhone: string | null = null;
    let instanceName: string | null = null;

    // If WhatsApp number provided, validate and set up Evolution
    if (input.whatsappNumber) {
      normalizedPhone = normalizeBrazilianPhone(input.whatsappNumber);
      if (!normalizedPhone) {
        throw new Error(`Invalid Brazilian phone number: ${input.whatsappNumber}`);
      }

      // Prevent duplicate tenants with the same phone number
      const existing = await prisma.tenant.findUnique({ where: { whatsappNumber: normalizedPhone } });
      if (existing) {
        throw new Error(`A tenant with phone number ${normalizedPhone} already exists (${existing.businessName})`);
      }

      instanceName = `lk-${input.businessName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
    }

    // Create tenant in database with a unique API key
    const apiKey = `lk_${crypto.randomBytes(24).toString('hex')}`;
    const tenant = await prisma.tenant.create({
      data: {
        businessName: input.businessName,
        whatsappNumber: normalizedPhone,
        evolutionInstanceId: instanceName,
        timezone: input.timezone,
        businessHours: input.businessHours,
        aiConfig: input.aiConfig,
        notificationConfig: input.notificationConfig ?? undefined,
        plan: input.plan,
        apiKey,
        // Web-only tenants go straight to active (no WhatsApp onboarding needed)
        status: normalizedPhone ? 'onboarding' : 'active',
      },
    });

    // Provision Evolution API instance only if WhatsApp is configured
    if (instanceName) {
      try {
        await evolutionClient.createInstance(instanceName);
        logger.info({ tenantId: tenant.id, instanceName }, 'Tenant created with Evolution instance');
      } catch (err) {
        logger.error({ err, tenantId: tenant.id }, 'Failed to create Evolution instance');
        // Tenant is created but instance failed — can retry via /connect endpoint
      }
    } else {
      logger.info({ tenantId: tenant.id }, 'Web-only tenant created (no WhatsApp)');
    }

    return tenant;
  }

  /** Get a tenant by ID */
  async getById(id: string) {
    return prisma.tenant.findUnique({ where: { id } });
  }

  /** List all tenants */
  async list(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.tenant.count(),
    ]);
    return { tenants, total, page, limit };
  }

  /** Update a tenant (deep-merges JSON fields so partial updates don't overwrite) */
  async update(id: string, input: UpdateTenantInput) {
    if (input.whatsappNumber) {
      const normalized = normalizeBrazilianPhone(input.whatsappNumber);
      if (!normalized) throw new Error(`Invalid Brazilian phone number: ${input.whatsappNumber}`);
      input.whatsappNumber = normalized;
    }

    // Deep-merge JSON config fields with existing values
    if (input.aiConfig != null || input.notificationConfig != null) {
      const existing = await prisma.tenant.findUnique({ where: { id } });
      if (!existing) throw new Error('Tenant not found');

      if (input.aiConfig != null) {
        const current = (existing.aiConfig as Record<string, any>) ?? {};
        input.aiConfig = { ...current, ...input.aiConfig } as any;
      }
      if (input.notificationConfig != null) {
        const current = (existing.notificationConfig as Record<string, any>) ?? {};
        input.notificationConfig = { ...current, ...input.notificationConfig } as any;
      }
    }

    return prisma.tenant.update({ where: { id }, data: input });
  }

  /** Suspend a tenant */
  async suspend(id: string) {
    return prisma.tenant.update({ where: { id }, data: { status: 'suspended' } });
  }

  /** Activate a tenant */
  async activate(id: string) {
    return prisma.tenant.update({ where: { id }, data: { status: 'active' } });
  }

  /** Connect the tenant's WhatsApp (returns QR code) */
  async connectWhatsApp(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant?.evolutionInstanceId) throw new Error('No Evolution instance for this tenant');

    // Ensure the instance exists (re-create if it was lost)
    try {
      await evolutionClient.getInstanceStatus(tenant.evolutionInstanceId);
    } catch {
      logger.info({ id }, 'Instance not found, recreating...');
      await evolutionClient.createInstance(tenant.evolutionInstanceId);
    }

    const qr = await evolutionClient.connectInstance(tenant.evolutionInstanceId);
    return qr;
  }

  /** Get WhatsApp connection status */
  async getWhatsAppStatus(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant?.evolutionInstanceId) throw new Error('No Evolution instance for this tenant');

    const status = await evolutionClient.getInstanceStatus(tenant.evolutionInstanceId);
    logger.info({ id, state: status.state, tenantStatus: tenant.status }, 'WhatsApp status check');

    // If connected, activate tenant and ensure webhook is configured
    if (status.state === 'open' && tenant.status === 'onboarding') {
      await prisma.tenant.update({ where: { id }, data: { status: 'active' } });

      // Configure webhook to point to our app
      try {
        await evolutionClient.setWebhook(
          tenant.evolutionInstanceId,
          evolutionConfig.webhookUrl,
        );
        logger.info({ id, webhookUrl: evolutionConfig.webhookUrl }, 'Webhook configured on activation');
      } catch (err: any) {
        logger.warn(
          { id, webhookUrl: evolutionConfig.webhookUrl, error: err?.response?.data ?? err?.message ?? err },
          'Failed to configure webhook on activation',
        );
      }
    }

    return status;
  }

  /** Manually (re)configure the webhook for a tenant's Evolution instance */
  async setupWebhook(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant?.evolutionInstanceId) throw new Error('No Evolution instance for this tenant');

    await evolutionClient.setWebhook(
      tenant.evolutionInstanceId,
      evolutionConfig.webhookUrl,
    );

    return { webhookUrl: evolutionConfig.webhookUrl, instanceName: tenant.evolutionInstanceId };
  }

  /** Generate (or regenerate) an API key for a tenant */
  async generateApiKey(id: string) {
    const apiKey = `lk_${crypto.randomBytes(24).toString('hex')}`;
    const tenant = await prisma.tenant.update({
      where: { id },
      data: { apiKey },
    });
    return { apiKey: tenant.apiKey };
  }

  /** Delete a tenant and all its related data */
  async delete(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new Error('Tenant not found');

    // Best-effort: remove Evolution API instance. Short timeout so an
    // unreachable Evolution API doesn't block the entire delete.
    if (tenant.evolutionInstanceId) {
      try {
        await evolutionClient.deleteInstance(tenant.evolutionInstanceId);
      } catch (err) {
        logger.warn({ err, id }, 'Failed to delete Evolution instance (non-fatal)');
      }
    }

    // Explicit sequential cascade inside an interactive transaction.
    // Cannot rely on DB-level CASCADE alone: prisma db push runs in the
    // background at container start and may not have applied the new FK
    // constraints before the first delete request arrives.
    await prisma.$transaction(async (tx) => {
      await tx.tenantUser.deleteMany({ where: { tenantId: id } });
      await tx.review.deleteMany({ where: { tenantId: id } });
      await tx.invoice.deleteMany({ where: { tenantId: id } });
      await tx.subscription.deleteMany({ where: { tenantId: id } });
      await tx.notification.deleteMany({ where: { tenantId: id } });
      await tx.message.deleteMany({ where: { tenantId: id } });
      await tx.conversation.deleteMany({ where: { tenantId: id } });
      await tx.campaignContact.deleteMany({ where: { campaign: { tenantId: id } } });
      await tx.campaign.deleteMany({ where: { tenantId: id } });
      await tx.booking.deleteMany({ where: { tenantId: id } });
      await tx.contact.deleteMany({ where: { tenantId: id } });
      await tx.tenant.delete({ where: { id } });
    });

    logger.info({ id }, 'Tenant and all related data deleted');
  }
}

export const tenantService = new TenantService();
