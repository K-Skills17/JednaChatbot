import { describe, it, expect } from 'vitest';
import { scoreQualification } from '../../concierge/qualification';

describe('scoreQualification — deterministic scoring', () => {
  it('scores 0 for empty data', () => {
    const { score, qualified } = scoreQualification({});
    expect(score).toBe(0);
    expect(qualified).toBe(false);
  });

  it('scores motivo (20 points)', () => {
    const { score } = scoreQualification({ motivo: 'implante' });
    expect(score).toBe(20);
  });

  it('scores regiao_ok (25 points)', () => {
    const { score } = scoreQualification({ regiao_ok: true });
    expect(score).toBe(25);
  });

  it('does not score regiao_ok if false', () => {
    const { score } = scoreQualification({ regiao_ok: false });
    expect(score).toBe(0);
  });

  it('scores ja_avaliou_antes (10 points)', () => {
    const { score } = scoreQualification({ ja_avaliou_antes: 'sim' });
    expect(score).toBe(10);
  });

  it('scores has_slot for dia_preferido (20 points)', () => {
    const { score } = scoreQualification({ dia_preferido: 'segunda' });
    expect(score).toBe(20);
  });

  it('scores has_slot for periodo_preferido (20 points)', () => {
    const { score } = scoreQualification({ periodo_preferido: 'manha' });
    expect(score).toBe(20);
  });

  it('scores prazo_near_term when matching keyword (25 points)', () => {
    const { score } = scoreQualification({ prazo: 'o quanto antes' });
    expect(score).toBe(25);
  });

  it('does not score prazo when no keyword match', () => {
    const { score } = scoreQualification({ prazo: 'no ano que vem' });
    expect(score).toBe(0);
  });

  it('qualifies at threshold (60)', () => {
    // motivo (20) + regiao_ok (25) + prazo near-term (25) = 70
    const { score, qualified } = scoreQualification({
      motivo: 'implante',
      regiao_ok: true,
      prazo: 'urgente',
    });
    expect(score).toBe(70);
    expect(qualified).toBe(true);
  });

  it('does not qualify below threshold', () => {
    // motivo (20) + ja_avaliou (10) = 30
    const { score, qualified } = scoreQualification({
      motivo: 'protese',
      ja_avaliou_antes: 'nao',
    });
    expect(score).toBe(30);
    expect(qualified).toBe(false);
  });

  it('caps at 100', () => {
    const { score } = scoreQualification({
      motivo: 'implante',
      regiao_ok: true,
      ja_avaliou_antes: 'sim',
      dia_preferido: 'terca',
      prazo: 'agora',
    });
    expect(score).toBe(100);
  });

  it('respects custom rules', () => {
    const { score, qualified } = scoreQualification(
      { motivo: 'sono' },
      { weights: { motivo: 50 }, qualified_threshold: 40 },
    );
    expect(score).toBe(50);
    expect(qualified).toBe(true);
  });

  it('respects custom near_term_keywords', () => {
    const { score } = scoreQualification(
      { prazo: 'imediatamente' },
      { near_term_keywords: ['imediatamente'] },
    );
    expect(score).toBe(25);
  });

  it('keyword matching is case-insensitive', () => {
    const { score } = scoreQualification({ prazo: 'URGENTE' });
    expect(score).toBe(25);
  });
});
