import { describe, it, expect } from 'vitest';
import {
  normalizeBrazilianPhone,
  formatBrazilianPhone,
  cleanPhone,
  toWhatsAppJid,
  fromWhatsAppJid,
} from '../utils/phone.utils';

describe('phone.utils', () => {
  describe('cleanPhone', () => {
    it('strips non-digit characters', () => {
      expect(cleanPhone('+55 (11) 91234-5678')).toBe('5511912345678');
    });

    it('handles raw digits', () => {
      expect(cleanPhone('5511912345678')).toBe('5511912345678');
    });
  });

  describe('normalizeBrazilianPhone', () => {
    it('normalizes a full mobile number', () => {
      expect(normalizeBrazilianPhone('+55 11 91234-5678')).toBe('5511912345678');
    });

    it('adds country code if missing', () => {
      expect(normalizeBrazilianPhone('11912345678')).toBe('5511912345678');
    });

    it('handles local format with 0 prefix', () => {
      expect(normalizeBrazilianPhone('011912345678')).toBe('5511912345678');
    });

    it('normalizes a landline number', () => {
      // Landline: 55 + 2-digit DDD + 8-digit number
      expect(normalizeBrazilianPhone('551112345678')).toBe('551112345678');
    });

    it('returns null for invalid numbers', () => {
      expect(normalizeBrazilianPhone('123')).toBeNull();
      expect(normalizeBrazilianPhone('')).toBeNull();
    });
  });

  describe('formatBrazilianPhone', () => {
    it('formats a mobile number', () => {
      expect(formatBrazilianPhone('5511912345678')).toBe('+55 (11) 91234-5678');
    });

    it('formats a landline number', () => {
      expect(formatBrazilianPhone('551112345678')).toBe('+55 (11) 1234-5678');
    });

    it('returns raw string for unrecognized format', () => {
      expect(formatBrazilianPhone('123')).toBe('123');
    });
  });

  describe('WhatsApp JID', () => {
    it('converts to JID', () => {
      expect(toWhatsAppJid('5511912345678')).toBe('5511912345678@s.whatsapp.net');
    });

    it('extracts phone from JID', () => {
      expect(fromWhatsAppJid('5511912345678@s.whatsapp.net')).toBe('5511912345678');
    });
  });
});
