import { describe, it, expect } from 'vitest';
import { calculateFormLeadScore, buildScoredFirstMessage } from '../modules/facebook/form-lead-scoring';

describe('calculateFormLeadScore', () => {
  it('scores "Entre 5 e 15" no-shows + "R$300–500" ticket as tier1', () => {
    const result = calculateFormLeadScore('Entre 5 e 15', 'R$300–500');
    expect(result).not.toBeNull();
    expect(result!.noShowsPerMonth).toBe(10);
    expect(result!.averageTicket).toBe(400);
    expect(result!.monthlyLoss).toBe(4000);
    expect(result!.annualLoss).toBe(48000);
    expect(result!.tier).toBe('tier1');
    expect(result!.leadScore).toBeGreaterThanOrEqual(60);
  });

  it('scores "Mais de 30" no-shows as tier3 (urgent)', () => {
    const result = calculateFormLeadScore('Mais de 30', 'R$500–800');
    expect(result).not.toBeNull();
    expect(result!.noShowsPerMonth).toBe(35);
    expect(result!.averageTicket).toBe(650);
    expect(result!.monthlyLoss).toBe(22750);
    expect(result!.annualLoss).toBe(273000);
    expect(result!.tier).toBe('tier3');
    expect(result!.leadScore).toBeGreaterThanOrEqual(90);
    expect(result!.priority).toBe('call_within_1h');
  });

  it('scores "Menos de 5" no-shows as nurture', () => {
    const result = calculateFormLeadScore('Menos de 5', 'Até R$150');
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('nurture');
    expect(result!.leadScore).toBeLessThan(30);
  });

  it('scores "Entre 15 e 30" no-shows as tier2 (hot)', () => {
    const result = calculateFormLeadScore('Entre 15 e 30', 'R$150–300');
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('tier2');
    expect(result!.leadScore).toBeGreaterThanOrEqual(80);
    expect(result!.priority).toBe('call_same_day');
  });

  it('returns null for missing answers', () => {
    expect(calculateFormLeadScore(undefined, 'R$300–500')).toBeNull();
    expect(calculateFormLeadScore('Entre 5 e 15', undefined)).toBeNull();
    expect(calculateFormLeadScore(undefined, undefined)).toBeNull();
  });

  it('returns null for unrecognized dropdown values', () => {
    expect(calculateFormLeadScore('random text', 'R$300–500')).toBeNull();
    expect(calculateFormLeadScore('Entre 5 e 15', 'random text')).toBeNull();
  });

  it('handles case-insensitive matching', () => {
    const result = calculateFormLeadScore('ENTRE 5 E 15', 'r$300–500');
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('tier1');
  });

  it('handles hyphen variants in ticket ranges (– vs -)', () => {
    const resultDash = calculateFormLeadScore('Entre 5 e 15', 'R$300-500');
    const resultEndash = calculateFormLeadScore('Entre 5 e 15', 'R$300–500');
    expect(resultDash).not.toBeNull();
    expect(resultEndash).not.toBeNull();
    expect(resultDash!.averageTicket).toBe(resultEndash!.averageTicket);
  });

  it('scores high-end ticket with ICP bonus', () => {
    const highEnd = calculateFormLeadScore('Entre 5 e 15', 'Acima de R$800');
    const lowEnd = calculateFormLeadScore('Entre 5 e 15', 'Até R$150');
    expect(highEnd).not.toBeNull();
    expect(lowEnd).not.toBeNull();
    // High-end ticket should have a higher score due to ICP bonus
    expect(highEnd!.leadScore).toBeGreaterThan(lowEnd!.leadScore);
  });
});

describe('buildScoredFirstMessage', () => {
  it('builds nurture message with diagnostic call invite (no revenue numbers)', () => {
    const scoring = calculateFormLeadScore('Menos de 5', 'Até R$150')!;
    const msg = buildScoredFirstMessage('João', 'Clinica Sorriso', scoring);
    expect(msg).toContain('formulário no Facebook');
    expect(msg).toContain('conversa de 30 minutos');
    expect(msg).toContain('diagnóstico');
    // Nurture should NOT show the loss numbers
    expect(msg).not.toContain('Perda mensal');
    // Should NOT mention Protocolo
    expect(msg).not.toContain('Protocolo');
  });

  it('builds tier1 message with revenue loss and diagnostic call invite', () => {
    const scoring = calculateFormLeadScore('Entre 5 e 15', 'R$300–500')!;
    const msg = buildScoredFirstMessage('Maria', 'Clinica Dental Plus', scoring);
    expect(msg).toContain('formulário no Facebook');
    expect(msg).toContain('Faltas por mês');
    expect(msg).toContain('Perda mensal');
    expect(msg).toContain('Perda anual');
    expect(msg).toContain('conversa de 30 minutos');
    expect(msg).toContain('diagnóstico');
    // Should NOT mention Protocolo
    expect(msg).not.toContain('Protocolo');
  });

  it('builds tier3 message with urgency and diagnostic call invite', () => {
    const scoring = calculateFormLeadScore('Mais de 30', 'R$500–800')!;
    const msg = buildScoredFirstMessage('Carlos', null, scoring);
    expect(msg).toContain('urgente');
    expect(msg).toContain('formulário no Facebook');
    expect(msg).toContain('conversa de 30 minutos');
    expect(msg).toContain('diagnóstico');
    // Should NOT mention Protocolo
    expect(msg).not.toContain('Protocolo');
  });

  it('handles null name gracefully', () => {
    const scoring = calculateFormLeadScore('Entre 5 e 15', 'R$300–500')!;
    const msg = buildScoredFirstMessage(null, null, scoring);
    expect(msg).toContain('tudo bem');
    expect(msg).toContain('da sua clínica');
  });
});
