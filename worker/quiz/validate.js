// @ts-check
import { optionIds, LIMITS } from '../../quiz/questions.js';
import { normalizeIlMobile } from '../../quiz/phone.js';

/** Name of the hidden honeypot input. Real users never fill it. */
export const HONEYPOT_FIELD = 'website';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** @param {unknown} v @param {number} max */
function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** @param {any} body */
export function isHoneypot(body) {
  const v = body?.[HONEYPOT_FIELD];
  return typeof v === 'string' && v.trim() !== '';
}

/** @param {string} field @param {string} error */
const fail = (field, error) => ({ ok: /** @type {const} */ (false), field, error });

/**
 * @typedef {Object} Answers
 * @property {string} [industry]
 * @property {string} [industry_other]
 * @property {string} [size]
 * @property {string[]} [channels]
 * @property {string} [acquisition]
 * @property {string} [sink]
 * @property {string} [hours]
 * @property {string} [pain]
 *
 * @typedef {Object} Submission
 * @property {'partial'|'complete'} stage
 * @property {string} session_id
 * @property {Answers} answers
 * @property {{ name: string, whatsapp: string, whatsapp_e164: string, email: string, consent: boolean } | null} contact
 * @property {{ source: string, medium: string, campaign: string }} utm
 * @property {string} device
 */

/**
 * Validates and normalizes a POST /api/quiz body.
 * partial: needs industry, size, channels (sent from Q3 onward); later answers optional.
 * complete: needs every required answer + contact.
 * @param {any} body
 * @returns {{ ok: true, value: Submission } | { ok: false, field: string, error: string }}
 */
export function validateSubmission(body) {
  const stage = body?.stage === 'partial' ? 'partial' : body?.stage === 'complete' ? 'complete' : null;
  if (!stage) return fail('stage', 'invalid_stage');

  const session_id = String(body.session_id ?? '');
  if (!UUID_RE.test(session_id)) return fail('session_id', 'invalid_session');

  const a = body.answers && typeof body.answers === 'object' ? body.answers : {};
  /** @type {Answers} */
  const answers = {};

  /** @param {string} qid @param {boolean} required */
  const single = (qid, required) => {
    const v = a[qid];
    if (v == null || v === '') return required ? fail(qid, 'missing') : null;
    if (!optionIds(qid).includes(v)) return fail(qid, 'invalid_option');
    answers[qid] = v;
    return null;
  };

  const later = stage === 'complete';
  let err =
    single('industry', true) ||
    single('size', true);
  if (err) return err;

  if (!Array.isArray(a.channels) || a.channels.length < 1) return fail('channels', 'missing');
  const ch = [...new Set(a.channels)];
  if (ch.length > 2) return fail('channels', 'too_many');
  if (!ch.every((c) => optionIds('channels').includes(c))) return fail('channels', 'invalid_option');
  answers.channels = ch;

  err = single('acquisition', later) || single('sink', later) || single('hours', later);
  if (err) return err;

  if (answers.industry === 'other') answers.industry_other = cleanText(a.industry_other, LIMITS.industryOther);
  answers.pain = cleanText(a.pain, LIMITS.pain);

  let contact = null;
  if (stage === 'complete') {
    const c = body.contact && typeof body.contact === 'object' ? body.contact : {};
    const name = cleanText(c.name, LIMITS.name);
    if (name.length < 2) return fail('name', 'missing');
    const phone = normalizeIlMobile(c.whatsapp);
    if (!phone) return fail('whatsapp', c.whatsapp ? 'invalid_phone' : 'missing');
    const email = cleanText(c.email, LIMITS.email);
    if (email && !EMAIL_RE.test(email)) return fail('email', 'invalid_email');
    contact = { name, whatsapp: phone.local, whatsapp_e164: phone.e164, email, consent: c.consent === true };
  }

  const u = body.utm && typeof body.utm === 'object' ? body.utm : {};
  const utm = { source: cleanText(u.source, 100), medium: cleanText(u.medium, 100), campaign: cleanText(u.campaign, 100) };
  const device = ['mobile', 'tablet', 'desktop'].includes(body.device) ? body.device : 'unknown';

  return { ok: true, value: { stage, session_id, answers, contact, utm, device } };
}

/** @param {any} body */
export function validateClick(body) {
  const session_id = String(body?.session_id ?? '');
  return UUID_RE.test(session_id) ? { ok: true, session_id } : { ok: false, session_id: '' };
}
