// @ts-check
// Validation of an analysis result (LLM or template).
import { INDUSTRY_EXAMPLES } from './catalog.js';

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

/** Absolute and speed claims. Soften them ("תמיד" to "לרוב") rather than promise. */
export const OVERCLAIMS = ['תמיד', 'לעולם', 'אף פעם', 'מיידי', 'כל הכסף', 'כל הזמן', 'כולם', 'אף אחד', 'לחסוך', 'חיסכון', 'חוסך', 'תחסכו'];

/** Longest sentence allowed, in words. Long sentences are where the grammar slips (QA 2026-10-20). */
export const MAX_SENTENCE_WORDS = 24;

/** Product text per solution must stay inside the catalog entry: these fragments are out of scope. */
export const SCOPE_EXTRAS = { quote_docs: ['תזכורת', 'גבייה', 'תשלום'], owner_briefing: ['מייל', 'וואטסאפ'] };

/** Words that appear in the industry hints but are plain document and meeting words, never flagged. */
const HINT_STOP = new Set(['הצעת', 'הצעות', 'מחיר', 'מסמך', 'מסמכים', 'לקוח', 'לקוחות', 'פגישות', 'פגישה', 'חשבונית', 'חשבוניות', 'קבלה', 'קבלות', 'עסקיים', 'עסקי']);
/** One leading prefix letter off ("לקורסים" -> "קורסים"). @param {string} w */
const stemOf = (w) => (w.length > 4 && 'ובהלמכש'.includes(w[0]) ? w.slice(1) : w);
/**
 * Words from the owner's industry hints that appear in the product text although the owner never wrote them
 * ("מחולל הצעות ומסמכים לקורסים" for an education business). Used on model output only, not on the template.
 * @param {any} r @param {{ industry?: string, industry_other?: string, pain?: string }} answers
 * @returns {string[]}
 */
export function hintWordsInProduct(r, answers) {
  const ex = /** @type {Record<string, any>} */ (INDUSTRY_EXAMPLES)[answers.industry || 'other'];
  if (!ex) return [];
  const own = `${answers.pain || ''} ${answers.industry_other || ''}`;
  const hints = new Set();
  // only the document and audience nouns: "תורים", "סיורים" and the customer question are plain job words the product may use
  for (const w of [ex.doc, ex.docPl, ex.to].join(' ').split(/\s+/)) {
    const s = stemOf(w);
    if (s.length >= 4 && !HINT_STOP.has(w) && !HINT_STOP.has(s)) hints.add(s);
  }
  const text = [r.product?.name, r.product?.does, r.product?.week1].join(' ');
  return [...new Set(text.split(/[\s.,;:!?"'()]+/).map(stemOf).filter((s) => hints.has(s) && !own.includes(s)))];
}

/**
 * When the industry was typed as free text ("סטודיו לעיצוב גרפי"), it may describe what the owner sells, not
 * that they run such a business. Returns words from that text which the model used as a fact about the owner
 * ("כשעובדים לבד בסטודיו") and the owner did not write in their pain text. Model output only.
 * @param {any} r @param {{ industry?: string, industry_other?: string, pain?: string }} answers
 * @returns {string[]}
 */
export function freeTextIndustryWords(r, answers) {
  if (answers.industry !== 'other' || !answers.industry_other) return [];
  const pain = String(answers.pain || '');
  const stems = answers.industry_other.split(/[\s,.;:!?"'()]+/).map(stemOf).filter((s) => s.length >= 4 && !pain.includes(s));
  const text = [r.what_i_saw, r.biggest_leak, r.product?.name, r.product?.does, r.product?.week1].join(' ');
  return [...new Set(stems.filter((s) => text.includes(s)))];
}

/** Channels the product text may only name when the owner selected them (or wrote the word in pain_text). */
const CHANNEL_WORDS = { whatsapp: ['וואטסאפ', 'ווטסאפ'], email: ['מייל', 'דוא"ל'] };

/** Words that may follow the object marker "את" (a definite object): "את ה...", "את כל", "את זה"... */
const AFTER_AT = ['כל', 'זה', 'זאת', 'מה', 'מי', 'מספר', 'כמה', 'אלה', 'אלו', 'שני', 'שתי', 'אתכם', 'אתנו'];

/** @param {string} s */
const sentencesOf = (s) => String(s || '').split(/[.!?\n]+/).map((x) => x.trim()).filter(Boolean);

/**
 * Hebrew slips the model made in the 2026-10-20 batch: a feminine "you" ("זה את"), the object marker
 * "את" before an indefinite noun ("סימנת את דיווחים"), and the banned "לא X אלא Y" contrast.
 * @param {string} text
 * @returns {string[]}
 */
export function grammarSlips(text) {
  const out = [];
  if (/(^|[\s,.:])זה את(?=[\s,.:?!]|$)/.test(text)) out.push('feminine "you" ("זה את")');
  for (const s of sentencesOf(text)) {
    if (/(^|[\s,])לא\s+[^.!?]{1,80}?\sאלא(?!\s+אם)(?=\s|$)/.test(s)) out.push(`contrast framing "לא X אלא Y" in "${s.slice(0, 40)}"`);
    if (wordCount(s) > MAX_SENTENCE_WORDS) out.push(`sentence over ${MAX_SENTENCE_WORDS} words ("${s.slice(0, 30)}...")`);
  }
  const toks = text.split(/\s+/).filter(Boolean);
  toks.forEach((t, i) => {
    if (!/^(ו|ש|כש|וש)?את$/.test(t) || i === toks.length - 1) return; // "את", "ואת", "שאת": "ואת נשארת" is a feminine "you"
    const nextRaw = toks[i + 1].replace(/^["'(]+/, '');
    const next = nextRaw.replace(/[.,;:!?)"']+$/, ''); // "את מי." and "את מי," are fine
    const after = (toks[i + 2] || '').replace(/^["'(]+/, '');
    // a construct chain is definite when its last noun is: "את פרטי הפונה", "את תמונת המצב"
    const construct = after.startsWith('ה') && after !== 'הכי' && !/[,;:]$/.test(nextRaw);
    const ok = next.startsWith('ה') || next.startsWith('אות') || /^[0-9A-Za-z]/.test(next) || construct || AFTER_AT.some((w) => next === w || next.startsWith(w + '-'));
    if (!ok) out.push(`"את" before an indefinite word ("את ${next}")`);
  });
  return out;
}

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
 * @param {{ channels?: string[], pain?: string, industry?: string, industry_other?: string }} [answers] when given, the product text may only name channels the owner selected
 * @param {{ modelOutput?: boolean }} [opts] modelOutput: also reject industry-hint words the owner never wrote (the template uses them by design)
 * @returns {{ ok: boolean, errors: string[], words: number }}
 */
export function checkResult(r, shortlist, answers, opts) {
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
  for (const o of OVERCLAIMS) if (all.includes(o) && !String(answers?.pain || '').includes(o)) errors.push(`absolute or speed claim "${o}"`); // the owner's own word, quoted back, is fine
  for (const f of fields) for (const slip of grammarSlips(f)) errors.push(slip);
  const productText = [pr.name, pr.does, pr.week1].join(' ');
  for (const w of /** @type {Record<string, string[]>} */ (SCOPE_EXTRAS)[pr.solution_id] || []) if (productText.includes(w)) errors.push(`product goes beyond the catalog entry ("${w}")`);
  if (opts?.modelOutput && answers) {
    for (const w of hintWordsInProduct(r, answers)) errors.push(`industry hint word in the product text ("${w}")`);
    for (const w of freeTextIndustryWords(r, answers)) errors.push(`free-text industry used as a fact about the owner ("${w}")`);
  }
  if (answers?.channels) {
    for (const [id, words] of Object.entries(CHANNEL_WORDS)) {
      if (answers.channels.includes(id)) continue;
      for (const w of words) if (all.includes(w) && !String(answers.pain || '').includes(w)) errors.push(`names a channel the owner did not select ("${w}")`);
    }
  }
  return { ok: errors.length === 0, errors, words };
}
