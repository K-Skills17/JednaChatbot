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
  // Prevent unhandled errors from crashing the process
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
  });

  const app = await buildApp();

  // In production, always listen on 3000 (must match railway.toml internalPort).
  // Railway injects its own PORT env var which may differ — ignore it.
  const port = env.NODE_ENV === 'production' ? 3000 : env.PORT;

  // Start the server FIRST so health check responds immediately
  await app.listen({ port, host: '0.0.0.0' });

  // Then connect DB and start workers (non-fatal — server stays up)
  if (env.DATABASE_URL && env.REDIS_URL) {
    try {
      await connectDatabase();

      startMessageWorker();
      startReminderWorker();
      startCampaignWorker();
      await startCampaignScheduler();
      startNotificationWorker();
    } catch (err) {
      logger.error({ err }, 'Failed to connect services — server running without workers');
    }
  } else {
    logger.warn('DATABASE_URL or REDIS_URL not set — running in health-check-only mode');
  }

  logger.info(`Server running on http://0.0.0.0:${port}`);
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
