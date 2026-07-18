// TCPA / dental board compliance gate. Runs on EVERY outbound SMS reply before it is sent.
// Prohibited patterns => block the generated text, swap a safe handoff line, force handoff.
// Every outbound (passed or blocked) is logged to compliance_audit table.

const PROHIBITED: { label: string; re: RegExp }[] = [
  // Price / fee discussion (redirect to practice)
  { label: 'price_dollar', re: /\$\s?\d/ },
  { label: 'price_words', re: /\b(how much|the cost is|fee is|pricing is|charge you|payment plan|costs \$)\b/i },

  // Treatment outcome guarantees — dental board violations
  { label: 'guarantee', re: /\bguarantee\b/i },
  { label: 'guaranteed_results', re: /guaranteed\s+(results|outcome|success|pain.?free)/i },
  { label: 'pain_free_guarantee', re: /pain.?free\s+guaranteed/i },
  { label: 'cure', re: /\bcure\s+(your|the|this)\b/i },
  { label: '100_percent', re: /\b100\s*%\s*(success|effective|guaranteed)/i },

  // Superlative / best-in-class claims
  { label: 'best_dentist', re: /\bbest\s+(dentist|dental\s+practice|dental\s+office|orthodontist)\b/i },
  { label: 'number_one', re: /\b(#\s*1|number\s*one|no\.\s*1)\s+(dentist|dental|provider)\b/i },

  // Emergency urgency manipulation
  { label: 'emergency_bait', re: /you\s+(must|need to|have to)\s+(call|come in|book)\s+(right now|immediately|today or)/i },

  // HIPAA-adjacent: never reference specific health conditions in outbound SMS
  { label: 'diagnosis', re: /\b(you have|you've been diagnosed|your condition is|your x-ray shows)\b/i },
];

export interface ComplianceResult {
  passed: boolean;
  flaggedTerms: string[];
  checks: Record<string, unknown>;
}

export const SAFE_HANDOFF_REPLY =
  "Let me connect you with our team — they'll be able to help you with that directly.";

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
