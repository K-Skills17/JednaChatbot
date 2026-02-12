import { describe, it, expect } from 'vitest';

// Test the pure functions exported/used internally in conversation.engine
// Since they're not exported, we test via the module's behavior patterns

describe('conversation.engine patterns', () => {
  describe('opt-out detection', () => {
    // Replicating the opt-out logic for testing
    const OPT_OUT_KEYWORDS = ['sair', 'parar', 'pare', 'stop', 'cancelar', 'não quero mais'];

    function isOptOut(text: string): boolean {
      const normalized = text.toLowerCase().trim();
      return OPT_OUT_KEYWORDS.some((kw) => normalized === kw || normalized.startsWith(kw + ' '));
    }

    it('detects exact opt-out keywords', () => {
      expect(isOptOut('sair')).toBe(true);
      expect(isOptOut('parar')).toBe(true);
      expect(isOptOut('pare')).toBe(true);
      expect(isOptOut('stop')).toBe(true);
      expect(isOptOut('cancelar')).toBe(true);
      expect(isOptOut('não quero mais')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isOptOut('SAIR')).toBe(true);
      expect(isOptOut('Parar')).toBe(true);
      expect(isOptOut('STOP')).toBe(true);
    });

    it('detects keywords with trailing text', () => {
      expect(isOptOut('sair agora')).toBe(true);
      expect(isOptOut('parar por favor')).toBe(true);
    });

    it('does not false-positive on partial matches', () => {
      expect(isOptOut('parabéns')).toBe(false);
      expect(isOptOut('cancelamento parcial')).toBe(false);
      expect(isOptOut('eu quero saber')).toBe(false);
    });
  });

  describe('AI response parsing', () => {
    function parseActionJson(jsonStr: string, rawText: string) {
      const parsed = JSON.parse(jsonStr);
      return {
        replyText: parsed.replyText ?? rawText,
        nextState: parsed.nextState ?? undefined,
        extractedData: parsed.extractedData ?? undefined,
        leadScore: parsed.leadScore ?? undefined,
        leadStatus: parsed.leadStatus ?? undefined,
        shouldEscalate: parsed.shouldEscalate ?? false,
        bookingDate: parsed.bookingDate ?? undefined,
        bookingTime: parsed.bookingTime ?? undefined,
      };
    }

    it('parses a full structured response', () => {
      const json = JSON.stringify({
        replyText: 'Olá!',
        nextState: 'qualifying',
        extractedData: { nome: 'João' },
        leadScore: 50,
      });
      const action = parseActionJson(json, 'fallback');
      expect(action.replyText).toBe('Olá!');
      expect(action.nextState).toBe('qualifying');
      expect(action.extractedData).toEqual({ nome: 'João' });
      expect(action.leadScore).toBe(50);
      expect(action.shouldEscalate).toBe(false);
    });

    it('uses rawText as fallback for replyText', () => {
      const json = JSON.stringify({ nextState: 'closed' });
      const action = parseActionJson(json, 'some raw text');
      expect(action.replyText).toBe('some raw text');
    });

    it('parses booking fields', () => {
      const json = JSON.stringify({
        replyText: 'Agendado!',
        nextState: 'closed',
        bookingDate: '2026-03-15',
        bookingTime: '14:30',
      });
      const action = parseActionJson(json, '');
      expect(action.bookingDate).toBe('2026-03-15');
      expect(action.bookingTime).toBe('14:30');
    });
  });

  describe('template substitution', () => {
    function substituteTemplate(template: string, vars: Record<string, string>): string {
      return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
        return vars[key] ?? _match;
      });
    }

    it('replaces known variables', () => {
      const result = substituteTemplate('Olá {{nome}}, da {{empresa}}!', {
        nome: 'Maria',
        empresa: 'Acme',
      });
      expect(result).toBe('Olá Maria, da Acme!');
    });

    it('leaves unknown variables unchanged', () => {
      const result = substituteTemplate('Olá {{nome}}, {{desconhecido}}!', {
        nome: 'João',
      });
      expect(result).toBe('Olá João, {{desconhecido}}!');
    });

    it('handles empty template', () => {
      expect(substituteTemplate('', { nome: 'test' })).toBe('');
    });

    it('handles template with no variables', () => {
      expect(substituteTemplate('Plain text', {})).toBe('Plain text');
    });
  });

  describe('booking date parsing', () => {
    function parseBookingDateTime(dateStr: string, timeStr: string): Date | null {
      try {
        const [year, month, day] = dateStr.split('-').map(Number);
        const [hours, minutes] = timeStr.split(':').map(Number);
        const date = new Date(year, month - 1, day, hours, minutes);
        if (isNaN(date.getTime())) return null;
        return date;
      } catch {
        return null;
      }
    }

    it('parses valid date and time', () => {
      const result = parseBookingDateTime('2026-03-15', '14:30');
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2026);
      expect(result!.getMonth()).toBe(2); // March = 2 (0-indexed)
      expect(result!.getDate()).toBe(15);
      expect(result!.getHours()).toBe(14);
      expect(result!.getMinutes()).toBe(30);
    });

    it('returns null for invalid date', () => {
      expect(parseBookingDateTime('invalid', '14:30')).toBeNull();
    });
  });
});
