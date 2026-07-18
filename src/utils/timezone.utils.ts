/**
 * Brazil timezone utilities.
 *
 * Brazil has 4 timezones (DST abolished in 2019):
 *   America/Sao_Paulo   (BRT, UTC-3) — most common
 *   America/Manaus      (AMT, UTC-4)
 *   America/Rio_Branco  (ACT, UTC-5)
 *   America/Noronha     (FNT, UTC-2)
 */

export const BRAZIL_TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Rio_Branco',
  'America/Noronha',
] as const;

export type BrazilTimezone = (typeof BRAZIL_TIMEZONES)[number];

/** Get current time in a specific timezone */
export function nowInTimezone(tz: string): Date {
  const str = new Date().toLocaleString('en-US', { timeZone: tz });
  return new Date(str);
}

/** Check if current time falls within business hours */
export function isWithinBusinessHours(
  tz: string,
  hours: { start: string; end: string; days: number[] },
): boolean {
  const now = nowInTimezone(tz);
  const day = now.getDay(); // 0=Sun, 6=Sat
  if (!hours.days.includes(day)) return false;

  const [startH, startM] = hours.start.split(':').map(Number);
  const [endH, endM] = hours.end.split(':').map(Number);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

/** Format a date for display in US English */
export function formatDateEnUs(date: Date, tz: string): string {
  return date.toLocaleDateString('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** @deprecated Use formatDateEnUs instead */
export const formatDatePtBr = formatDateEnUs;
