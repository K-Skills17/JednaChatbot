import { Job } from 'bullmq';
import { prisma } from '../config/database';
import { evolutionClient } from '../modules/whatsapp/evolution.client';
import { logger } from '../utils/logger';

/**
 * WhatsApp keepalive — runs every 5 minutes.
 * Checks connection state for all active tenants and reconnects if needed.
 * Prevents WhatsApp from disconnecting linked devices due to inactivity.
 */
export async function keepaliveProcessor(job: Job): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: { status: 'active', evolutionInstanceId: { not: null } },
    select: { id: true, businessName: true, evolutionInstanceId: true },
  });

  for (const tenant of tenants) {
    const instanceName = tenant.evolutionInstanceId!;
    try {
      const { state } = await evolutionClient.getInstanceStatus(instanceName);

      if (state === 'open') {
        logger.debug({ instanceName }, 'WhatsApp keepalive: connected');
        continue;
      }

      // Try to reconnect
      logger.warn({ instanceName, state }, 'WhatsApp keepalive: not connected, attempting reconnect');
      await evolutionClient.connectInstance(instanceName);
      logger.info({ instanceName }, 'WhatsApp keepalive: reconnect triggered');
    } catch (err: any) {
      logger.error({ instanceName, err: err.message }, 'WhatsApp keepalive: failed to check/reconnect');
    }
  }
}
