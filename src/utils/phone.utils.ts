/**
 * Brazilian phone number utilities.
 *
 * Valid formats:
 *   +55 11 91234-5678  (mobile, 9 digits)
 *   +55 11 1234-5678   (landline, 8 digits)
 *   5511912345678       (raw)
 */

const BR_MOBILE_REGEX = /^55(\d{2})(9\d{8})$/;
const BR_LANDLINE_REGEX = /^55(\d{2})(\d{8})$/;

/** Strip everything except digits and leading '+' */
export function cleanPhone(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}

/** Normalise to E.164-ish: 5511912345678 */
export function normalizeBrazilianPhone(raw: string): string | null {
  let digits = cleanPhone(raw);

  // If starts with 0, assume local — prepend country code
  if (digits.startsWith('0')) digits = '55' + digits.slice(1);

  // If no country code, prepend 55
  if (!digits.startsWith('55')) digits = '55' + digits;

  if (BR_MOBILE_REGEX.test(digits) || BR_LANDLINE_REGEX.test(digits)) {
    return digits;
  }

  return null; // invalid
}

/** Format for display: +55 (11) 91234-5678 */
export function formatBrazilianPhone(normalized: string): string {
  const mobile = normalized.match(BR_MOBILE_REGEX);
  if (mobile) {
    const [, ddd, number] = mobile;
    return `+55 (${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`;
  }

  const landline = normalized.match(BR_LANDLINE_REGEX);
  if (landline) {
    const [, ddd, number] = landline;
    return `+55 (${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
  }

  return normalized;
}

/** WhatsApp JID format: 5511912345678@s.whatsapp.net */
export function toWhatsAppJid(normalized: string): string {
  return `${normalized}@s.whatsapp.net`;
}

/** Extract phone from WhatsApp JID */
export function fromWhatsAppJid(jid: string): string {
  return jid.split('@')[0];
}
