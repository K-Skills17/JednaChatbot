import { describe, it, expect } from 'vitest';
import { parseEnvelope } from '../../concierge/envelope';

describe('parseEnvelope — T1 unit tests', () => {
  // ── T1a: valid envelope ──────────────────────────────────
  it('parses a valid concierge envelope', () => {
    const raw = JSON.stringify({
      reply: 'Oi! Como posso ajudar?',
      stage: 'descoberta',
      qualification: { nome: 'Ana' },
      action: 'continuar',
      handoff_reason: null,
      handoff_summary: null,
      compliance_flag: false,
    });

    const env = parseEnvelope(raw);
    expect(env.reply).toBe('Oi! Como posso ajudar?');
    expect(env.stage).toBe('descoberta');
    expect(env.qualification).toEqual({ nome: 'Ana' });
    expect(env.action).toBe('continuar');
    expect(env.compliance_flag).toBe(false);
    expect(env.handoff_reason).toBeNull();
  });

  it('parses old lk-chatbot format (replyText, nextState)', () => {
    const raw = JSON.stringify({
      replyText: 'Ola, tudo bem?',
      nextState: 'qualifying',
      extractedData: { nome: 'Carlos' },
      shouldEscalate: false,
    });

    const env = parseEnvelope(raw);
    expect(env.reply).toBe('Ola, tudo bem?');
    expect(env.stage).toBe('qualificacao');
    expect(env.action).toBe('continuar');
  });

  // ── T1c: code fences ─────────────────────────────────────
  it('strips ```json fences and parses successfully', () => {
    const raw = '```json\n' + JSON.stringify({
      reply: 'Entendi!',
      stage: 'qualificacao',
      qualification: {},
      action: 'continuar',
      compliance_flag: false,
    }) + '\n```';

    const env = parseEnvelope(raw);
    expect(env.reply).toBe('Entendi!');
    expect(env.stage).toBe('qualificacao');
    expect(env.action).toBe('continuar');
  });

  it('strips bare ``` fences (no json tag)', () => {
    const raw = '```\n{"reply":"Oi","stage":"saudacao","qualification":{},"action":"continuar","compliance_flag":false}\n```';
    const env = parseEnvelope(raw);
    expect(env.reply).toBe('Oi');
    expect(env.stage).toBe('saudacao');
  });

  // ── T1b: malformed / broken AI output ─────────────────────
  it('returns fallback on truncated JSON', () => {
    const raw = 'Claro! Aqui vai: { reply: \'oi\'';
    const env = parseEnvelope(raw);
    expect(env.action).toBe('encaminhar');
    expect(env.handoff_reason).toBe('parse_error');
    expect(env.reply).toContain('equipe');
  });

  it('returns fallback on non-JSON prose', () => {
    const raw = 'Claro que sim! Posso te ajudar com implantes dentarios.';
    const env = parseEnvelope(raw);
    expect(env.action).toBe('encaminhar');
    expect(env.handoff_reason).toBe('parse_error');
  });

  it('returns fallback on empty string', () => {
    const env = parseEnvelope('');
    expect(env.action).toBe('encaminhar');
    expect(env.handoff_reason).toBe('parse_error');
  });

  it('returns fallback when reply field is missing', () => {
    const raw = JSON.stringify({
      stage: 'descoberta',
      action: 'continuar',
    });
    const env = parseEnvelope(raw);
    expect(env.action).toBe('encaminhar');
    expect(env.handoff_reason).toBe('parse_error');
  });

  it('returns fallback when reply is not a string', () => {
    const raw = JSON.stringify({
      reply: 123,
      action: 'continuar',
    });
    const env = parseEnvelope(raw);
    expect(env.action).toBe('encaminhar');
  });

  // ── prose-wrapped JSON ────────────────────────────────────
  it('extracts JSON embedded in surrounding prose', () => {
    const raw = 'Aqui esta minha resposta:\n' + JSON.stringify({
      reply: 'Tudo certo!',
      stage: 'valor',
      qualification: { motivo: 'implante' },
      action: 'continuar',
      compliance_flag: false,
    }) + '\nEspero ter ajudado.';

    const env = parseEnvelope(raw);
    expect(env.reply).toBe('Tudo certo!');
    expect(env.stage).toBe('valor');
  });

  // ── action mapping (old format) ───────────────────────────
  it('maps shouldEscalate to encaminhar', () => {
    const raw = JSON.stringify({
      replyText: 'Vou transferir',
      nextState: 'closed',
      shouldEscalate: true,
    });
    const env = parseEnvelope(raw);
    expect(env.action).toBe('encaminhar');
  });

  it('maps booking nextState with bookingDate to agendar', () => {
    const raw = JSON.stringify({
      replyText: 'Confirmado!',
      nextState: 'closed',
      bookingDate: '2026-06-01',
      bookingTime: '14:00',
    });
    const env = parseEnvelope(raw);
    expect(env.action).toBe('agendar');
    expect(env.bookingDate).toBe('2026-06-01');
  });
});
