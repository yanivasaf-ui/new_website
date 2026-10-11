// @ts-check
// Israeli mobile number normalizer, shared by the page (inline validation) and the Worker.

/**
 * Accepts spaces, dashes, parentheses and +972 / 972 / 0 prefixes.
 * @param {unknown} raw
 * @returns {{ local: string, e164: string } | null}
 */
export function normalizeIlMobile(raw) {
  let d = String(raw ?? '').replace(/[\s\-().]/g, '');
  if (d.startsWith('+972')) d = '0' + d.slice(4);
  else if (d.startsWith('00972')) d = '0' + d.slice(5);
  else if (d.startsWith('972')) d = '0' + d.slice(3);
  d = d.replace(/^00/, '0');
  if (!/^05\d{8}$/.test(d)) return null;
  return { local: d, e164: '+972' + d.slice(1) };
}
