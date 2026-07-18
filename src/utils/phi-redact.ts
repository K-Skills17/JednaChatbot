/**
 * PHI (Protected Health Information) redaction for message history passed to AI.
 * Strips patterns that should not be sent to third-party AI providers.
 *
 * SCOPE: Applied to stored message content BEFORE sending to AI context.
 * Raw messages are stored unredacted in the DB (encrypted at rest per deployment config).
 *
 * Redacted patterns:
 * - US SSNs (XXX-XX-XXXX)
 * - DOB patterns (common formats)
 * - Insurance member/group IDs (contextual)
 * - Raw credit card numbers
 */

// Each redactor: { pattern, replacement }
const REDACTORS: Array<{ re: RegExp; label: string }> = [
  // SSN — 9 digit patterns
  { re: /\b\d{3}-\d{2}-\d{4}\b/g, label: '[SSN redacted]' },
  { re: /\b\d{9}\b(?=\s*(ssn|social))/gi, label: '[SSN redacted]' },

  // DOB — common US formats (not year alone to avoid false positives)
  { re: /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{4}|\d{2})\b/g, label: '[DOB redacted]' },
  { re: /\bborn\s+(on\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi, label: '[DOB redacted]' },

  // Credit card numbers (16-digit sequences with optional dashes/spaces)
  { re: /\b(?:\d[ -]?){16}\b/g, label: '[card# redacted]' },

  // Insurance member IDs — common prefix patterns
  { re: /\b(member\s*(?:id|#|number)[:\s]+)[A-Z0-9]{6,20}\b/gi, label: '$1[ID redacted]' },
  { re: /\b(group\s*(?:id|#|number)[:\s]+)[A-Z0-9]{4,15}\b/gi, label: '$1[ID redacted]' },
];

/**
 * Redact PHI from a message string before passing to AI.
 * Returns the redacted string. Non-PHI content is preserved.
 */
export function redactPhi(text: string): string {
  let result = text;
  for (const { re, label } of REDACTORS) {
    result = result.replace(re, label);
  }
  return result;
}
