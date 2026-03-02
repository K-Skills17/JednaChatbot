import { prisma } from '../../config/database';
import { evolutionClient } from '../whatsapp/evolution.client';
import { evolutionConfig } from '../../config/evolution';
import { logger } from '../../utils/logger';
import { normalizeBrazilianPhone } from '../../utils/phone.utils';
import { CreateTenantInput, UpdateTenantInput } from './tenant.schema';

export class TenantService {
  /** Create a new tenant and provision an Evolution API instance */
  async create(input: CreateTenantInput) {
    const normalizedPhone = normalizeBrazilianPhone(input.whatsappNumber);
    if (!normalizedPhone) {
      throw new Error(`Invalid Brazilian phone number: ${input.whatsappNumber}`);
    }

    // Generate a unique instance name
    const instanceName = `lk-${input.businessName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;

    // Create tenant in database
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
        status: 'onboarding',
      },
    });

    // Provision Evolution API instance
    try {
      await evolutionClient.createInstance(instanceName);
      logger.info({ tenantId: tenant.id, instanceName }, 'Tenant created with Evolution instance');
    } catch (err) {
      logger.error({ err, tenantId: tenant.id }, 'Failed to create Evolution instance');
      // Tenant is created but instance failed — can retry via /connect endpoint
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

  /** Update a tenant */
  async update(id: string, input: UpdateTenantInput) {
    if (input.whatsappNumber) {
      const normalized = normalizeBrazilianPhone(input.whatsappNumber);
      if (!normalized) throw new Error(`Invalid Brazilian phone number: ${input.whatsappNumber}`);
      input.whatsappNumber = normalized;
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
      } catch (err) {
        logger.warn({ err, id }, 'Failed to configure webhook on activation');
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

  /** Delete a tenant and all its related data */
  async delete(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new Error('Tenant not found');

    if (tenant.evolutionInstanceId) {
      try {
        await evolutionClient.deleteInstance(tenant.evolutionInstanceId);
      } catch (err) {
        logger.warn({ err, id }, 'Failed to delete Evolution instance');
      }
    }

    // Database cascade (onDelete: Cascade in schema) handles all child records
    await prisma.tenant.delete({ where: { id } });

    logger.info({ id }, 'Tenant and all related data deleted');
  }
}

export const tenantService = new TenantService();
