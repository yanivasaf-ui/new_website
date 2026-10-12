// @ts-check
// Lead notification emails via Resend.
import { optionLabel } from '../../quiz/questions.js';

const SUBJECT_PREFIX = 'ליד חדש מהקוויז';
const HOT_SIZES = ['6_15', '16_50', '50_plus'];

/** @param {import('../index.js').Env} env */
export const emailConfigured = (env) => Boolean(env.RESEND_API_KEY && env.LEAD_EMAIL_FROM);

/** @param {string} size @param {boolean} clicked */
export const isHot = (size, clicked) => clicked || HOT_SIZES.includes(size);

/** @param {unknown} s */
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** @param {[string, string][]} rows */
const table = (rows) =>
  `<table dir="rtl" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:15px">${rows
    .map(([k, v]) => `<tr><td style="padding:6px 12px;color:#6b6258;vertical-align:top">${esc(k)}</td><td style="padding:6px 12px;color:#2E2B27">${v}</td></tr>`)
    .join('')}</table>`;

/** @param {import('../index.js').Env} env @param {string} subject @param {string} html @param {string} textBody */
async function send(env, subject, html, textBody) {
  if (!emailConfigured(env)) {
    console.warn('email not configured (RESEND_API_KEY / LEAD_EMAIL_FROM); skipped:', subject);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.LEAD_EMAIL_FROM,
      to: [env.LEAD_EMAIL_TO || 'asaf@ensemble-ai.io'],
      subject,
      html: `<div dir="rtl">${html}</div>`,
      text: textBody,
    }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return true;
}

/**
 * Email for every completed lead.
 * @param {import('../index.js').Env} env
 * @param {import('./validate.js').Submission} sub
 * @param {{ solutionTitle: string, solutionId: string, source: string }} rec
 * @param {string} [notionUrl]
 */
export async function sendLeadEmail(env, sub, rec, notionUrl = '') {
  const a = sub.answers;
  const c = sub.contact;
  if (!c) return false;
  const hot = isHot(a.size, false);
  const industry = optionLabel('industry', a.industry) + (a.industry_other ? ` (${a.industry_other})` : '');
  const subject = `${SUBJECT_PREFIX}${hot ? ' [חם]' : ''}: ${c.name} · ${optionLabel('industry', a.industry)}`;
  const rows = /** @type {[string, string][]} */ ([
    ['שם', esc(c.name)],
    ['מייל', `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`],
    ['וואטסאפ', c.whatsapp_e164 ? `<a href="tel:${esc(c.whatsapp_e164)}">${esc(c.whatsapp)}</a> · <a href="https://wa.me/${esc(c.whatsapp_e164.slice(1))}">פתיחת צ'אט</a>` : 'לא השאירו'],
    ['אישור חזרה', c.consent ? 'כן' : 'לא'],
    ['סוג עסק', esc(industry)],
    ['גודל', esc(optionLabel('size', a.size))],
    ['ערוצים', esc((a.channels || []).map((x) => optionLabel('channels', x)).join(', '))],
    ['לקוחות חדשים', esc(optionLabel('acquisition', a.acquisition))],
    ['איפה הזמן הולך', `${esc(optionLabel('sink', a.sink))} · ${esc(optionLabel('hours', a.hours))} ש׳/שבוע`],
    ['מה מעצבן', esc(a.pain || '—')],
    ['המלצה', `${esc(rec.solutionTitle)} (${esc(rec.solutionId)}, ${esc(rec.source)})`],
    ['מקור', esc([sub.utm.source, sub.utm.medium, sub.utm.campaign].filter(Boolean).join(' / ') || '—') + ` · ${esc(sub.device)}`],
  ]);
  if (notionUrl) rows.push(['Notion', `<a href="${esc(notionUrl)}">פתיחה</a>`]);
  const textBody = rows.map(([k, v]) => `${k}: ${v.replace(/<[^>]+>/g, '')}`).join('\n');
  return send(env, subject, `${hot ? '<p><b>ליד חם</b></p>' : ''}${table(rows)}`, textBody);
}

/**
 * Short email when the booking CTA is clicked (always hot).
 * @param {import('../index.js').Env} env
 * @param {{ name?: string, whatsapp?: string, email?: string, industry?: string, sink?: string, recommended_solution?: string, url?: string, session_id?: string }} lead
 */
export async function sendClickEmail(env, lead) {
  const name = lead.name || `סשן ${String(lead.session_id || '').slice(0, 8)}`;
  const subject = `${SUBJECT_PREFIX} [חם]: ${name} לחצו על קביעת שיחה`;
  const rows = /** @type {[string, string][]} */ ([
    ['שם', esc(name)],
    ['מייל', lead.email ? `<a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>` : '—'],
    ['וואטסאפ', lead.whatsapp ? `<a href="tel:${esc(lead.whatsapp)}">${esc(lead.whatsapp)}</a>` : 'לא השאירו'],
    ['סוג עסק', esc(lead.industry ? optionLabel('industry', lead.industry) : '—')],
    ['איפה הזמן הולך', esc(lead.sink ? optionLabel('sink', lead.sink) : '—')],
    ['המלצה', esc(lead.recommended_solution || '—')],
  ]);
  if (lead.url) rows.push(['Notion', `<a href="${esc(lead.url)}">פתיחה</a>`]);
  const textBody = rows.map(([k, v]) => `${k}: ${v.replace(/<[^>]+>/g, '')}`).join('\n');
  return send(env, subject, `<p>לחצו על הכפתור לקביעת שיחה ב-Cal.com.</p>${table(rows)}`, textBody);
}
