/**
 * T5d — Boot smoke test.
 * Verifies the app boots and all routes register (including the new ones)
 * without hitting a real database or Redis.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock all external dependencies so the app can boot without real services
vi.mock('../../config/database', () => ({
  prisma: new Proxy({}, { get: () => vi.fn() }),
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
}));

vi.mock('../../config/redis', () => ({
  redis: {},
  getRedis: vi.fn(() => ({})),
  buildRedisOptions: vi.fn(() => ({})),
  disconnectRedis: vi.fn(),
}));

vi.mock('../../modules/whatsapp/evolution.client', () => ({
  evolutionClient: {
    healthCheck: vi.fn().mockResolvedValue({ ok: false }),
    sendText: vi.fn(),
  },
}));

vi.mock('../../config/evolution', () => ({
  evolutionConfig: { baseUrl: 'http://localhost', apiKey: 'test', webhookUrl: 'http://localhost/webhook' },
}));

// Mock BullMQ Queue so it doesn't need Redis
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    getJob: vi.fn(),
    close: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
}));

describe('T5d — Boot smoke', () => {
  let app: any;

  beforeAll(async () => {
    // Dynamically import app after mocks are in place
    const { buildApp } = await import('../../app');
    app = await buildApp();
    await app.ready();
  });

  it('app boots without error', () => {
    expect(app).toBeTruthy();
  });

  it('registers the new POST /api/leads/intake route', () => {
    const routes = app.printRoutes({ commonPrefix: false });
    expect(routes).toContain('api/leads/intake');
  });

  it('registers webhook/evolution route', () => {
    const routes = app.printRoutes({ commonPrefix: false });
    expect(routes).toContain('webhook/evolution');
  });

  it('registers existing module routes', () => {
    const routes = app.printRoutes({ commonPrefix: false });
    // Spot-check key existing routes survived the merge
    expect(routes).toContain('api/tenants');
    expect(routes).toContain('webhook/facebook');
  });
});
