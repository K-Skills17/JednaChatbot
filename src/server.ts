import { buildApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { disconnectRedis } from './config/redis';
import {
  startMessageWorker,
  startReminderWorker,
  startCampaignWorker,
  startCampaignScheduler,
  startNotificationWorker,
} from './jobs/queue.setup';
import { logger } from './utils/logger';

async function main() {
  const app = await buildApp();

  // Only connect DB and start workers when env is fully configured
  if (env.DATABASE_URL) {
    await connectDatabase();

    startMessageWorker();
    startReminderWorker();
    startCampaignWorker();
    startCampaignScheduler();
    startNotificationWorker();
  } else {
    logger.warn('DATABASE_URL not set — running in health-check-only mode');
  }

  // Start the server (always — so health check responds)
  await app.listen({ port: env.PORT, host: '0.0.0.0' });

  logger.info(`Server running on http://0.0.0.0:${env.PORT}`);
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Webhook URL: ${env.WEBHOOK_BASE_URL}/webhook/evolution`);

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info({ signal }, 'Shutting down gracefully...');
      await app.close();
      await disconnectDatabase();
      await disconnectRedis();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
