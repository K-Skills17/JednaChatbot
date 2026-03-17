/**
 * Facebook Form Lead Scoring — Revenue Loss Calculator
 *
 * Maps dropdown selections from the Facebook lead form to midpoint values,
 * calculates monthly/annual revenue loss, and assigns a lead tier + score.
 */

// ── No-Show Dropdown Mapping ──────────────────────────────────

interface NoShowTier {
  calculationValue: number;
  signalLevel: string;
  priority: string;
}

const NO_SHOW_MAP: Record<string, NoShowTier> = {
  'menos de 5':  { calculationValue: 3,  signalLevel: 'low',    priority: 'nurture_only' },
  'entre 5 e 15': { calculationValue: 10, signalLevel: 'qualified', priority: 'priority_wa' },
  'entre 15 e 30': { calculationValue: 22, signalLevel: 'hot',     priority: 'call_same_day' },
  'mais de 30':  { calculationValue: 35, signalLevel: 'urgent',  priority: 'call_within_1h' },
};

// ── Ticket Dropdown Mapping ──────────────────────────────────

interface TicketTier {
  calculationValue: number;
  icpSignal: string;
}

const TICKET_MAP: Record<string, TicketTier> = {
  'até r$150':    { calculationValue: 125, icpSignal: 'volume_clinic_lower_icp' },
  'r$150–300':    { calculationValue: 225, icpSignal: 'standard_dental_core_icp' },
  'r$150-300':    { calculationValue: 225, icpSignal: 'standard_dental_core_icp' },
  'r$300–500':    { calculationValue: 400, icpSignal: 'premium_dental_strong_icp' },
  'r$300-500':    { calculationValue: 400, icpSignal: 'premium_dental_strong_icp' },
  'r$500–800':    { calculationValue: 650, icpSignal: 'aesthetic_implant_top_icp' },
  'r$500-800':    { calculationValue: 650, icpSignal: 'aesthetic_implant_top_icp' },
  'acima de r$800': { calculationValue: 900, icpSignal: 'high_end_priority_lead' },
};

// ── Lead Score Tiers ──────────────────────────────────────────

export type LeadTier = 'nurture' | 'tier1' | 'tier2' | 'tier3';

export interface FormLeadScore {
  /** Calculated no-shows per month (midpoint) */
  noShowsPerMonth: number;
  /** Calculated average ticket value in BRL */
  averageTicket: number;
  /** Monthly revenue loss: noShows × ticket */
  monthlyLoss: number;
  /** Annual revenue loss: monthlyLoss × 12 */
  annualLoss: number;
  /** Lead score 0–100 based on tier logic */
  leadScore: number;
  /** Signal level from no-show tier */
  signalLevel: string;
  /** ICP signal from ticket tier */
  icpSignal: string;
  /** Priority action */
  priority: string;
  /** Lead tier for message template selection */
  tier: LeadTier;
}

/**
 * Calculate lead score from Facebook form dropdown values.
 *
 * @param noShowAnswer - The no-show dropdown answer (e.g. "Entre 5 e 15")
 * @param ticketAnswer - The ticket dropdown answer (e.g. "R$300–500")
 * @returns Scoring result, or null if either answer doesn't match known values
 */
export function calculateFormLeadScore(
  noShowAnswer: string | undefined,
  ticketAnswer: string | undefined,
): FormLeadScore | null {
  if (!noShowAnswer || !ticketAnswer) return null;

  const normalizedNoShow = noShowAnswer.toLowerCase().trim();
  const normalizedTicket = ticketAnswer.toLowerCase().trim();

  const noShowTier = findMatch(normalizedNoShow, NO_SHOW_MAP);
  const ticketTier = findMatch(normalizedTicket, TICKET_MAP);

  if (!noShowTier || !ticketTier) return null;

  const noShowsPerMonth = noShowTier.calculationValue;
  const averageTicket = ticketTier.calculationValue;
  const monthlyLoss = noShowsPerMonth * averageTicket;
  const annualLoss = monthlyLoss * 12;

  // Determine lead tier and score based on no-show signal level
  const { tier, leadScore } = computeTierAndScore(
    noShowTier.signalLevel,
    ticketTier.icpSignal,
    monthlyLoss,
  );

  return {
    noShowsPerMonth,
    averageTicket,
    monthlyLoss,
    annualLoss,
    leadScore,
    signalLevel: noShowTier.signalLevel,
    icpSignal: ticketTier.icpSignal,
    priority: noShowTier.priority,
    tier,
  };
}

/**
 * Build the tiered WhatsApp first message based on lead score data.
 * Uses the Tier 1 template (5–15 no-shows) as the base, adapted for all tiers.
 */
export function buildScoredFirstMessage(
  name: string | null,
  clinicName: string | null,
  scoring: FormLeadScore,
): string {
  const displayName = name ?? 'tudo bem';
  const clinic = clinicName ? `da ${clinicName}` : 'da sua clínica';

  const formatBRL = (value: number): string =>
    `R$${value.toLocaleString('pt-BR')}`;

  // Tier-based messaging
  if (scoring.tier === 'nurture') {
    // Low signal — softer approach, no hard numbers push
    return [
      `Oi ${displayName}! Aqui é da LK Digital. 👋`,
      `Vi que você preencheu nosso formulário no Facebook — obrigado!`,
      ``,
      `Sabemos que faltas em consultas são um desafio para qualquer clínica. Preparamos o Protocolo de 7 Dias Anti-Faltas — são as 7 ações que clínicas usaram para reduzir faltas em 43%.`,
      ``,
      `Posso te enviar? 😊`,
    ].join('\n');
  }

  // Tier 1, 2, 3 — show the revenue loss calculation
  const lines = [
    `Oi ${displayName}! Aqui é da LK Digital.`,
    `Vi que você preencheu nosso formulário no Facebook e calculamos a perda ${clinic}:`,
    ``,
    `🔴 Faltas por mês: ~${scoring.noShowsPerMonth} consultas`,
    `💰 Ticket médio: ${formatBRL(scoring.averageTicket)}`,
    `📉 Perda mensal: ${formatBRL(scoring.monthlyLoss)}`,
    `📆 Perda anual: ${formatBRL(scoring.annualLoss)}`,
    ``,
    `Mandei também o Protocolo de 7 Dias Anti-Faltas — são as 7 ações que as clínicas que reduziram faltas em 43% implementaram nos primeiros 7 dias.`,
  ];

  if (scoring.tier === 'tier3') {
    // URGENT — strongest CTA
    lines.push(``);
    lines.push(`⚠️ Com ${scoring.noShowsPerMonth}+ faltas por mês, isso é urgente. Posso te mostrar como recuperar parte desse valor nos próximos 30 dias?`);
  } else if (scoring.tier === 'tier2') {
    // Hot — strong CTA
    lines.push(``);
    lines.push(`Posso te mostrar como recuperar parte desse valor nos próximos 30 dias?`);
  } else {
    // Tier 1 — standard CTA
    lines.push(``);
    lines.push(`Posso te mostrar como recuperar parte desse valor nos próximos 30 dias?`);
  }

  return lines.join('\n');
}

// ── Internal Helpers ──────────────────────────────────────────

function findMatch<T>(normalized: string, map: Record<string, T>): T | null {
  // Direct match
  if (map[normalized]) return map[normalized];

  // Fuzzy match — check if the normalized value contains a key or vice versa
  for (const [key, value] of Object.entries(map)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }

  return null;
}

function computeTierAndScore(
  signalLevel: string,
  icpSignal: string,
  monthlyLoss: number,
): { tier: LeadTier; leadScore: number } {
  // Base score from no-show signal
  let baseScore: number;
  let tier: LeadTier;

  switch (signalLevel) {
    case 'low':
      baseScore = 25;
      tier = 'nurture';
      break;
    case 'qualified':
      baseScore = 60;
      tier = 'tier1';
      break;
    case 'hot':
      baseScore = 80;
      tier = 'tier2';
      break;
    case 'urgent':
      baseScore = 95;
      tier = 'tier3';
      break;
    default:
      baseScore = 40;
      tier = 'nurture';
  }

  // ICP bonus: higher ticket = stronger ICP = small score boost
  const icpBonus: Record<string, number> = {
    'volume_clinic_lower_icp': -5,
    'standard_dental_core_icp': 0,
    'premium_dental_strong_icp': 3,
    'aesthetic_implant_top_icp': 5,
    'high_end_priority_lead': 5,
  };
  baseScore += icpBonus[icpSignal] ?? 0;

  // Clamp to 0–100
  const leadScore = Math.max(0, Math.min(100, baseScore));

  return { tier, leadScore };
}
