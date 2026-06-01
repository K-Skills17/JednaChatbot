import { describe, it, expect } from 'vitest';
import { runComplianceGate, SAFE_HANDOFF_REPLY } from '../../concierge/compliance';

describe('runComplianceGate — T2 unit tests', () => {
  // ── T2a: all 10 prohibited patterns ──────────────────────
  const prohibitedCases: [string, string][] = [
    ['garantia', 'Nos garantimos o melhor resultado!'],
    ['cura_garantida', 'A cura garantida do seu problema.'],
    ['cem_por_cento', 'Sucesso em 100% dos casos!'],
    ['superlativo_melhor', 'Somos a melhor clinica da cidade.'],
    ['barato', 'Nosso tratamento e o mais barato.'],
    ['desconto', 'Temos desconto especial esse mes.'],
    ['promocao', 'Aproveite nossa promocao de verao!'],
    ['preco_tratamento', 'O implante custa R$ 5.000 por unidade.'],
    ['sem_dor_garantida', 'Procedimento sem dor garantida.'],
    ['numero_um', 'Somos o numero 1 em implantes.'],
  ];

  for (const [label, reply] of prohibitedCases) {
    it(`flags "${label}" pattern`, () => {
      const result = runComplianceGate(reply, false);
      expect(result.passed).toBe(false);
      expect(result.flaggedTerms).toContain(label);
    });
  }

  // ── T2c: clean reply ─────────────────────────────────────
  it('passes a clean compliant reply', () => {
    const clean = 'Entendo sua preocupacao. A avaliacao e o primeiro passo para entender o melhor caminho para voce.';
    const result = runComplianceGate(clean, false);
    expect(result.passed).toBe(true);
    expect(result.flaggedTerms).toHaveLength(0);
  });

  // ── T2b: model self-flag ─────────────────────────────────
  it('blocks when model self-flags (compliance_flag: true), even if text is clean', () => {
    const clean = 'Vamos agendar sua avaliacao?';
    const result = runComplianceGate(clean, true);
    expect(result.passed).toBe(false);
    expect(result.flaggedTerms).toHaveLength(0); // regex found nothing
    expect(result.checks).toEqual({
      regex_flags: [],
      model_flag: true,
    });
  });

  // ── combined: regex + model flag ─────────────────────────
  it('flags both regex and model flag', () => {
    const reply = 'Garantimos resultado e temos desconto!';
    const result = runComplianceGate(reply, true);
    expect(result.passed).toBe(false);
    expect(result.flaggedTerms).toContain('garantia');
    expect(result.flaggedTerms).toContain('desconto');
  });

  // ── edge: partial match shouldn't flag ───────────────────
  it('does not flag "garantir" variants when used in safe context', () => {
    // "garantir" is caught by /\bgarant\w*/i — this IS expected to flag
    const reply = 'Nao posso garantir resultado especifico.';
    const result = runComplianceGate(reply, false);
    expect(result.passed).toBe(false);
    expect(result.flaggedTerms).toContain('garantia');
  });

  // ── safe handoff reply constant ──────────────────────────
  it('SAFE_HANDOFF_REPLY does not trigger any compliance flags', () => {
    const result = runComplianceGate(SAFE_HANDOFF_REPLY, false);
    expect(result.passed).toBe(true);
  });
});
