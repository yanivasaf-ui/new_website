// @ts-check
// Typo hint for the contact step: suggests a fix for a few common mistyped email domains.
// It is only a hint. The visitor can ignore it and the form still submits.

/** Mistyped domain -> the domain it most likely meant. */
const DOMAIN_FIXES = /** @type {Record<string, string>} */ ({
  'gmil.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotnail.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'walla.com': 'walla.co.il',
  'wala.co.il': 'walla.co.il',
});

/**
 * @param {unknown} raw
 * @returns {string | null} the corrected address, or null when there is nothing to suggest
 */
export function suggestEmailFix(raw) {
  const s = String(raw ?? '').trim();
  const at = s.lastIndexOf('@');
  if (at < 1) return null;
  const fixed = DOMAIN_FIXES[s.slice(at + 1).toLowerCase()];
  return fixed ? s.slice(0, at + 1) + fixed : null;
}
