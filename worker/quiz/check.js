// @ts-check
// Validation of an analysis result (LLM or template).

/** Hard cap per result block (what_i_saw / leak+estimate / product). */
export const BLOCK_MAX = 120;

/** Visible fields, in display order. `reason` is internal and not counted. */
const VISIBLE = (/** @type {any} */ r) => [
  r.what_i_saw,
  r.biggest_leak,
  r.estimate_note,
  r.product?.name,
  r.product?.does,
  r.product?.week1,
];

/** The product block states what gets built. It never gives advice about what the owner should do. */
const PRODUCT_ADVICE = ['כדאי', 'מומלץ'];

/** Substrings that must not appear (hype, promises, self-reference). */
export const BANNED = ['מהפכ', 'חדשנ', 'קוויז', 'שאלון', 'בינה מלאכותית', 'גיים צ', 'game changer', 'מובטח', 'מבטיח', 'בלי מאמץ', 'קסם', 'פורץ דרך', 'מדהים', '—', ' – ', 'ביותר', 'מושלם', 'מצוין', 'הכי טוב', 'אידיאלי'];
/**
 * Whole words that are unambiguously gendered 2nd person singular. Masculine future forms
 * (תוכל, תרצה...) are not listed: they are spelled like 3rd-person feminine ("המערכת תוכל"),
 * so the prompt handles them instead.
 */
export const GENDERED = ['אתה', 'תוכלי', 'תרצי', 'תגלי', 'תראי', 'תצטרכי', 'תקבלי', 'תחסכי'];

/** @param {string} s */
export const wordCount = (s) => String(s || '').split(/\s+/).filter(Boolean).length;

/** Share of letters that are Hebrew (ignores digits/punctuation). @param {string} s */
function hebrewRatio(s) {
  const heb = (s.match(/[֐-׿]/g) || []).length;
  const lat = (s.match(/[A-Za-z]/g) || []).length;
  return heb + lat === 0 ? 0 : heb / (heb + lat);
}

/**
 * @param {any} r
 * @param {string[]} shortlist
 * @returns {{ ok: boolean, errors: string[], words: number }}
 */
export function checkResult(r, shortlist) {
  const errors = [];
  if (!r || typeof r !== 'object') return { ok: false, errors: ['not an object'], words: 0 };
  for (const k of ['what_i_saw', 'biggest_leak', 'estimate_note']) {
    if (typeof r[k] !== 'string' || !r[k].trim()) errors.push(`missing ${k}`);
  }
  const pr = r.product;
  if (!pr || typeof pr !== 'object') errors.push('missing product');
  else {
    for (const k of ['solution_id', 'name', 'does', 'week1']) {
      if (typeof pr[k] !== 'string' || !pr[k].trim()) errors.push(`missing product.${k}`);
    }
    if (!shortlist.includes(pr.solution_id)) errors.push(`solution_id "${pr.solution_id}" not in shortlist [${shortlist.join(', ')}]`);
    if (wordCount(pr.name) > 6) errors.push('product name longer than 6 words');
    for (const f of PRODUCT_ADVICE) if ([pr.name, pr.does, pr.week1].join(' ').includes(f)) errors.push(`product block gives advice ("${f}")`);
  }
  if (errors.length) return { ok: false, errors, words: 0 };

  const fields = VISIBLE(r);
  const words = fields.reduce((n, f) => n + wordCount(f), 0);
  const blocks = {
    what_i_saw: wordCount(r.what_i_saw),
    biggest_leak: wordCount(r.biggest_leak) + wordCount(r.estimate_note),
    product: wordCount(pr.name) + wordCount(pr.does) + wordCount(pr.week1),
  };
  for (const [name, n] of Object.entries(blocks)) if (n > BLOCK_MAX) errors.push(`${name} has ${n} words, max ${BLOCK_MAX}`);
  fields.forEach((f, i) => {
    if (hebrewRatio(f) < 0.75) errors.push(`field ${i} is not mostly Hebrew`);
  });
  const all = fields.join(' ');
  for (const b of BANNED) if (all.toLowerCase().includes(b.toLowerCase())) errors.push(`banned term "${b}"`);
  const tokens = new Set(all.split(/[\s.,:;!?"'()\-–—]+/));
  for (const g of GENDERED) if (tokens.has(g)) errors.push(`gendered form "${g}"`);
  if (!/\d/.test(r.estimate_note)) errors.push('estimate_note has no numeric range');
  return { ok: errors.length === 0, errors, words };
}
