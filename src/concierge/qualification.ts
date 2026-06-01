// Per-tenant configurable lead qualification scoring.
// Pure & deterministic — tune per tenant via tenant.qualificationRules JSON.

export interface QualificationRules {
  weights?: {
    motivo?: number;
    regiao_ok?: number;
    prazo_near_term?: number;
    has_slot?: number;
    ja_avaliou_antes?: number;
  };
  near_term_keywords?: string[];
  qualified_threshold?: number;
}

export interface QualificationData {
  nome?: string | null;
  motivo?: string | null;
  situacao_atual?: string | null;
  ja_avaliou_antes?: string | null;
  prazo?: string | null;
  regiao_ok?: boolean | null;
  dia_preferido?: string | null;
  periodo_preferido?: string | null;
  [k: string]: unknown;
}

const DEFAULT_RULES: Required<QualificationRules> = {
  weights: {
    motivo: 20,
    regiao_ok: 25,
    prazo_near_term: 25,
    has_slot: 20,
    ja_avaliou_antes: 10,
  },
  near_term_keywords: [
    'agora', 'o quanto antes', 'esse m', 'este m',
    'urgente', 'logo', 'essa semana', 'proxim',
  ],
  qualified_threshold: 60,
};

function mergeRules(rules?: QualificationRules): Required<QualificationRules> {
  return {
    weights: { ...DEFAULT_RULES.weights, ...(rules?.weights ?? {}) },
    near_term_keywords: rules?.near_term_keywords ?? DEFAULT_RULES.near_term_keywords,
    qualified_threshold: rules?.qualified_threshold ?? DEFAULT_RULES.qualified_threshold,
  };
}

/**
 * Score a lead's accumulated qualification data.
 * Returns score (0-100) and whether the lead is qualified.
 */
export function scoreQualification(
  q: Partial<QualificationData>,
  rules?: QualificationRules,
): { score: number; qualified: boolean } {
  const r = mergeRules(rules);
  const w = r.weights;
  let score = 0;

  if (q.motivo) score += w.motivo ?? 0;
  if (q.regiao_ok === true) score += w.regiao_ok ?? 0;
  if (q.ja_avaliou_antes) score += w.ja_avaliou_antes ?? 0;
  if (q.dia_preferido || q.periodo_preferido) score += w.has_slot ?? 0;

  const prazo = (q.prazo ?? '').toString().toLowerCase();
  if (prazo && r.near_term_keywords.some((k) => prazo.includes(k.toLowerCase()))) {
    score += w.prazo_near_term ?? 0;
  }

  score = Math.max(0, Math.min(100, score));
  return { score, qualified: score >= r.qualified_threshold };
}
