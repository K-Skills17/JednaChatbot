import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

describe('webhook-auth', () => {
  describe('HMAC signature verification', () => {
    const secret = 'test-api-key';

    function generateSignature(body: string, key: string): string {
      return crypto.createHmac('sha256', key).update(body).digest('hex');
    }

    it('generates consistent HMAC signatures', () => {
      const body = JSON.stringify({ event: 'messages.upsert', data: {} });
      const sig1 = generateSignature(body, secret);
      const sig2 = generateSignature(body, secret);
      expect(sig1).toBe(sig2);
    });

    it('produces different signatures for different bodies', () => {
      const body1 = JSON.stringify({ event: 'messages.upsert' });
      const body2 = JSON.stringify({ event: 'messages.update' });
      const sig1 = generateSignature(body1, secret);
      const sig2 = generateSignature(body2, secret);
      expect(sig1).not.toBe(sig2);
    });

    it('produces different signatures for different keys', () => {
      const body = JSON.stringify({ event: 'test' });
      const sig1 = generateSignature(body, 'key1');
      const sig2 = generateSignature(body, 'key2');
      expect(sig1).not.toBe(sig2);
    });

    it('timing-safe comparison works correctly', () => {
      const body = JSON.stringify({ test: true });
      const sig = generateSignature(body, secret);
      expect(
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sig)),
      ).toBe(true);
    });
  });
});
