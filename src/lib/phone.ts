/**
 * Normalise a Sri Lankan mobile number to 94XXXXXXXXX (no plus).
 * Accepts 0771234567, 771234567, +94771234567, 94 77 123 4567, etc.
 * Returns null when it isn't a valid mobile number.
 */
export function normalizeMobile(input: string): string | null {
  let d = input.replace(/[^\d]/g, '');
  if (d.startsWith('0094')) d = d.slice(4);
  else if (d.startsWith('94') && d.length === 11) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  // Sri Lankan mobiles are 7X XXX XXXX after the country code.
  if (!/^7\d{8}$/.test(d)) return null;
  return `94${d}`;
}

/**
 * Drivers log in with mobile + password. Supabase's email/password auth is free
 * and needs no SMS provider, so the number is mapped to a login id that is
 * never emailed (email confirmation must be off in the Supabase project).
 */
export function mobileToLoginId(mobile94: string): string {
  return `${mobile94}@drivers.tuktukmeter.local`;
}

/**
 * A customer's WhatsApp number as digits with country code (what wa.me needs).
 * Sri Lankan numbers can be typed locally (0771234567); foreign numbers,
 * e.g. tourists', need a + or 00 prefix. Returns null if it can't be a number.
 */
export function normalizeWhatsApp(input: string): string | null {
  const t = input.trim();
  if (t.startsWith('+') || t.startsWith('00')) {
    const d = t.replace(/[^\d]/g, '').replace(/^00/, '');
    if (d.startsWith('94')) return normalizeMobile(d);
    return /^[1-9]\d{7,14}$/.test(d) ? d : null;
  }
  return normalizeMobile(t);
}

export function formatMobile(mobile94: string): string {
  const d = mobile94.replace(/^94/, '0');
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}
