// Per-tenant configurable lead qualification scoring.
// Pure & deterministic — tune per tenant via tenant.qualificationRules JSON.

export interface QualificationRules {
  weights?: {
    treatment_need?: number;
    location_ok?: number;
    near_term?: number;
    has_time_slot?: number;
    prior_patient?: number;
  };
  near_term_keywords?: string[];
  qualified_threshold?: number;
}

export interface QualificationData {
  name?: string | null;
  treatment_need?: string | null;   // What treatment the patient needs / inquiry about
  current_situation?: string | null; // Why they haven't scheduled yet
  prior_patient?: string | null;    // Were they a previous patient?
  timeline?: string | null;         // When are they looking to book?
  location_ok?: boolean | null;     // Is the practice location acceptable?
  preferred_day?: string | null;    // Preferred day of week
  preferred_period?: string | null; // Preferred time of day
  [k: string]: unknown;
}

const DEFAULT_RULES: Required<QualificationRules> = {
  weights: {
    treatment_need: 20,
    location_ok: 25,
    near_term: 25,
    has_time_slot: 20,
    prior_patient: 10,
  },
  near_term_keywords: [
    'asap', 'as soon as possible', 'this week', 'next week',
    'urgent', 'right away', 'this month', 'soon',
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

  if (q.treatment_need) score += w.treatment_need ?? 0;
  if (q.location_ok === true) score += w.location_ok ?? 0;
  if (q.prior_patient) score += w.prior_patient ?? 0;
  if (q.preferred_day || q.preferred_period) score += w.has_time_slot ?? 0;

  const timeline = (q.timeline ?? '').toString().toLowerCase();
  if (timeline && r.near_term_keywords.some((k) => timeline.includes(k.toLowerCase()))) {
    score += w.near_term ?? 0;
  }

  score = Math.max(0, Math.min(100, score));
  return { score, qualified: score >= r.qualified_threshold };
}
