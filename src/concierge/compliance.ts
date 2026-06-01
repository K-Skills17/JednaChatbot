// CFO/CRO compliance gate. Runs on EVERY outbound reply before it is sent.
// Prohibited patterns => block the generated text, swap a safe line, force handoff.
// Every outbound (passed or blocked) is logged to compliance_audit table.

const PROHIBITED: { label: string; re: RegExp }[] = [
  { label: 'garantia', re: /\bgarant\w*/i },
  { label: 'cura_garantida', re: /cura\s+garantid/i },
  { label: 'cem_por_cento', re: /\b100\s*%/ },
  { label: 'superlativo_melhor', re: /\bmelhor\s+(cl[ií]nica|dentista|pre[cç]o)/i },
  { label: 'barato', re: /\bbarat\w*/i },
  { label: 'desconto', re: /\bdesconto\w*/i },
  { label: 'promocao', re: /\bpromo[cç]\w*/i },
  { label: 'preco_tratamento', re: /R\$\s?\d/ },
  { label: 'sem_dor_garantida', re: /sem\s+dor\s+garantid/i },
  { label: 'numero_um', re: /\bn[uú]mero\s*1\b|\bn[ºo]\s*1\b/i },
];

export interface ComplianceResult {
  passed: boolean;
  flaggedTerms: string[];
  checks: Record<string, unknown>;
}

export const SAFE_HANDOFF_REPLY =
  'Vou te conectar com nossa equipe, um instante :)';

/**
 * Evaluate a reply against prohibited patterns.
 * `modelFlag` is the envelope's compliance_flag (model self-flagging).
 * passed = no prohibited pattern AND the model did not self-flag.
 */
export function runComplianceGate(reply: string, modelFlag: boolean): ComplianceResult {
  const flaggedTerms: string[] = [];
  for (const p of PROHIBITED) {
    if (p.re.test(reply)) flaggedTerms.push(p.label);
  }
  const passed = flaggedTerms.length === 0 && !modelFlag;
  return {
    passed,
    flaggedTerms,
    checks: { regex_flags: flaggedTerms, model_flag: modelFlag },
  };
}
