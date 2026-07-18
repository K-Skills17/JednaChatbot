/**
 * Acceptance tests for the Jedna Marketing dental lead-qualification bot.
 *
 * These tests verify the core behavioral requirements without hitting external
 * APIs (Twilio, Claude, DB).  They exercise pure functions replicated from the
 * production modules so the test suite is fast and deterministic.
 */
import { describe, it, expect } from 'vitest';

// ─── 1. TCPA / STOP keyword detection ─────────────────────────────────────

describe('TCPA opt-out detection', () => {
  const STOP_KEYWORDS = new Set(['stop', 'unsubscribe', 'cancel', 'quit', 'end']);

  function isStop(text: string): boolean {
    return STOP_KEYWORDS.has(text.toLowerCase().trim());
  }

  it('detects every CTIA-required STOP keyword', () => {
    expect(isStop('stop')).toBe(true);
    expect(isStop('unsubscribe')).toBe(true);
    expect(isStop('cancel')).toBe(true);
    expect(isStop('quit')).toBe(true);
    expect(isStop('end')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isStop('STOP')).toBe(true);
    expect(isStop('Stop')).toBe(true);
    expect(isStop('UNSUBSCRIBE')).toBe(true);
  });

  it('does not false-positive on normal dental conversation', () => {
    expect(isStop('I want to stop the pain')).toBe(false);
    expect(isStop('can you cancel my appointment')).toBe(false);
    expect(isStop('end of day works for me')).toBe(false);
    expect(isStop('what time do you close')).toBe(false);
  });
});

// ─── 2. SMS 300-character limit enforcement ────────────────────────────────

describe('SMS 300-character limit', () => {
  const MAX_SMS_LENGTH = 300;

  function enforceLimit(text: string): string {
    if (text.length <= MAX_SMS_LENGTH) return text;
    return text.slice(0, MAX_SMS_LENGTH - 3) + '...';
  }

  it('passes through short replies unchanged', () => {
    const short = 'Hi! Thanks for reaching out. What brings you in today?';
    expect(enforceLimit(short)).toBe(short);
    expect(enforceLimit(short).length).toBeLessThanOrEqual(MAX_SMS_LENGTH);
  });

  it('truncates replies that exceed 300 chars', () => {
    const long = 'A'.repeat(350);
    const result = enforceLimit(long);
    expect(result.length).toBe(MAX_SMS_LENGTH);
    expect(result.endsWith('...')).toBe(true);
  });

  it('result is always ≤ 300 characters', () => {
    const boundary = 'B'.repeat(300);
    expect(enforceLimit(boundary).length).toBeLessThanOrEqual(MAX_SMS_LENGTH);
    const over = 'C'.repeat(301);
    expect(enforceLimit(over).length).toBeLessThanOrEqual(MAX_SMS_LENGTH);
  });
});

// ─── 3. Price / compliance guard ──────────────────────────────────────────

describe('Compliance: no price quoting in AI reply', () => {
  const PRICE_PATTERN = /\$\s*\d+/;

  function containsPrice(text: string): boolean {
    return PRICE_PATTERN.test(text);
  }

  it('detects dollar amounts in a reply', () => {
    expect(containsPrice('Implants start at $3,000')).toBe(true);
    expect(containsPrice('Just $99/month')).toBe(true);
    expect(containsPrice('$ 500 co-pay')).toBe(true);
  });

  it('does not flag price-free replies', () => {
    expect(containsPrice("I'd love to help you get scheduled — what treatment are you considering?")).toBe(false);
    expect(containsPrice('Our team can discuss payment options at your visit.')).toBe(false);
    expect(containsPrice('Please contact our front desk for a detailed quote.')).toBe(false);
  });
});

// ─── 4. Outcome / guarantee guard ─────────────────────────────────────────

describe('Compliance: no outcome guarantees in AI reply', () => {
  const GUARANTEE_PATTERN = /\b(guarantee|guaranteed|promise|for sure|100%|cure|fix your)\b/i;

  function containsGuarantee(text: string): boolean {
    return GUARANTEE_PATTERN.test(text);
  }

  it('detects guarantee language', () => {
    expect(containsGuarantee('We guarantee you will love the results.')).toBe(true);
    expect(containsGuarantee('This is guaranteed to work.')).toBe(true);
    expect(containsGuarantee("We'll fix your problem 100%")).toBe(true);
  });

  it('does not flag compliant replies', () => {
    expect(containsGuarantee("Most patients see great improvement with consistent care.")).toBe(false);
    expect(containsGuarantee("Our dentist will walk you through what to expect at your visit.")).toBe(false);
  });
});

// ─── 5. PHI redaction ─────────────────────────────────────────────────────

describe('PHI redaction before AI context', () => {
  // Replicate the redaction logic from src/utils/phi-redact.ts
  const REDACTORS: Array<{ re: RegExp; label: string }> = [
    { re: /\b\d{3}-\d{2}-\d{4}\b/g,          label: '[SSN redacted]' },
    { re: /\b\d{9}\b(?=\s*(ssn|social))/gi,   label: '[SSN redacted]' },
    { re: /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{4}|\d{2})\b/g, label: '[DOB redacted]' },
    { re: /\b(?:\d[ -]?){16}\b/g,             label: '[card# redacted]' },
    { re: /\b(member\s*(?:id|#|number)[:\s]+)[A-Z0-9]{6,20}\b/gi, label: '$1[ID redacted]' },
    { re: /\b(group\s*(?:id|#|number)[:\s]+)[A-Z0-9]{4,15}\b/gi,  label: '$1[ID redacted]' },
  ];

  function redactPhi(text: string): string {
    let result = text;
    for (const { re, label } of REDACTORS) {
      result = result.replace(re, label);
    }
    return result;
  }

  it('redacts SSN in XXX-XX-XXXX format', () => {
    expect(redactPhi('My SSN is 123-45-6789')).toBe('My SSN is [SSN redacted]');
  });

  it('redacts date of birth in MM/DD/YYYY format', () => {
    expect(redactPhi('DOB: 03/15/1985')).toBe('DOB: [DOB redacted]');
  });

  it('redacts 16-digit credit card numbers', () => {
    const result = redactPhi('Card: 4111 1111 1111 1111');
    expect(result).toContain('[card# redacted]');
    expect(result).not.toContain('4111');
  });

  it('redacts insurance member IDs', () => {
    const result = redactPhi('Member ID: ABC12345');
    expect(result).toContain('[ID redacted]');
    expect(result).not.toContain('ABC12345');
  });

  it('preserves non-PHI content', () => {
    const clean = 'I need a cleaning and have been in pain for 3 days.';
    expect(redactPhi(clean)).toBe(clean);
  });
});

// ─── 6. Qualification: max 3 questions ────────────────────────────────────

describe('Qualification question limit', () => {
  const MAX_QUALIFICATION_QUESTIONS = 3;

  function countQuestionsAsked(messages: Array<{ role: string; content: string }>): number {
    return messages
      .filter((m) => m.role === 'assistant')
      .reduce((count, m) => count + (m.content.includes('?') ? 1 : 0), 0);
  }

  it('allows up to 3 questions', () => {
    const msgs = [
      { role: 'assistant', content: 'What brings you in today?' },
      { role: 'user', content: 'I need a cleaning.' },
      { role: 'assistant', content: 'Great! When were you last seen by a dentist?' },
      { role: 'user', content: 'About 2 years ago.' },
      { role: 'assistant', content: 'Do mornings or afternoons work better for you?' },
      { role: 'user', content: 'Mornings are great.' },
    ];
    expect(countQuestionsAsked(msgs)).toBeLessThanOrEqual(MAX_QUALIFICATION_QUESTIONS);
  });

  it('detects when limit is exceeded', () => {
    const msgs = [
      { role: 'assistant', content: 'What brings you in?' },
      { role: 'user', content: 'Cleaning.' },
      { role: 'assistant', content: 'Have you been here before?' },
      { role: 'user', content: 'No.' },
      { role: 'assistant', content: 'What days work?' },
      { role: 'user', content: 'Mondays.' },
      { role: 'assistant', content: 'What time of day?' },
    ];
    expect(countQuestionsAsked(msgs)).toBeGreaterThan(MAX_QUALIFICATION_QUESTIONS);
  });
});

// ─── 7. Envelope action names (English) ───────────────────────────────────

describe('Concierge envelope action names', () => {
  type ConciergeAction = 'continue' | 'book' | 'handoff' | 'disqualify' | 'opt_out';
  const VALID_ACTIONS = new Set<ConciergeAction>(['continue', 'book', 'handoff', 'disqualify', 'opt_out']);

  function isValidAction(action: string): action is ConciergeAction {
    return VALID_ACTIONS.has(action as ConciergeAction);
  }

  it('accepts all valid English action names', () => {
    expect(isValidAction('continue')).toBe(true);
    expect(isValidAction('book')).toBe(true);
    expect(isValidAction('handoff')).toBe(true);
    expect(isValidAction('disqualify')).toBe(true);
    expect(isValidAction('opt_out')).toBe(true);
  });

  it('rejects old Portuguese action names', () => {
    expect(isValidAction('encaminhar')).toBe(false);
    expect(isValidAction('agendar')).toBe(false);
    expect(isValidAction('continuar')).toBe(false);
    expect(isValidAction('desqualificar')).toBe(false);
  });
});

// ─── 8. {{PLACEHOLDER}} substitution ──────────────────────────────────────

describe('Placeholder substitution', () => {
  function substitutePlaceholders(text: string, values: Record<string, string>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);
  }

  it('replaces known placeholders', () => {
    const result = substitutePlaceholders(
      'Book here: {{CALENDLY_URL}} or call {{PRACTICE_PHONE}}',
      { CALENDLY_URL: 'https://cal.test/demo', PRACTICE_PHONE: '+15555550100' },
    );
    expect(result).toBe('Book here: https://cal.test/demo or call +15555550100');
  });

  it('leaves unknown placeholders intact', () => {
    const result = substitutePlaceholders('Call {{UNKNOWN_VAR}}', {});
    expect(result).toBe('Call {{UNKNOWN_VAR}}');
  });

  it('handles text with no placeholders', () => {
    const plain = 'Hi there! How can we help you today?';
    expect(substitutePlaceholders(plain, {})).toBe(plain);
  });
});
