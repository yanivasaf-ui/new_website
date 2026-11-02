// @ts-check
// The guide download. The visitor ticks a consent box (contact step or on the result page), gets ONE email with the
// link, and every email carries an unsubscribe link. If GUIDE_URL or GUIDE_UNSUB_SECRET is not set, all of this is off.
//   GET  /api/guide/config       { on, url }
//   POST /api/guide              { session_id, consent: true, resend? } -> { ok, url } (sends the email)
//   GET  /api/guide/unsubscribe  ?t=<signed token> -> a small Hebrew page
import { json, guard, limited, readJson, clientIp, logErr } from './handlers.js';
import { rateLimit } from './ratelimit.js';
import { findLeadBySession, findLeadByEmail, upsertLead, updateLeadStrict, pageToLead, guideProps } from './notion.js';
import { sendToVisitor, sendOwnerNote } from './email.js';

/** All visitor-facing strings, from udi-guide-capture-copy-2026-11-02.md (Gatekeeper-approved for Asaf's choice). */
const COPY = {
  subject: 'המדריך שלכם: איך בונים את הסוכן הראשון', // G6a
  greeting: (/** @type {string} */ name) => (name ? `שלום ${name},` : 'שלום,'), // G6b
  body: 'הנה המדריך: איך בונים את הסוכן הראשון שלכם. שישה שלבים ודף אחד למילוי.', // G6c
  button: 'להורדת המדריך', // G6c
  booking: 'אחרי שמילאתם את הדף, אפשר לקבוע 20 דקות ולעבור עליו ביחד:', // G6d
  why: 'קיבלתם את המייל כי השארתם את הכתובת בשאלון ואישרתם לקבל את המדריך ומדי פעם מיילים.', // G6e
  unsub: 'להסרה מהרשימה:', // G6f
  signature: 'אסף, Ensemble AI', // G6g
  unsubDone: 'הוסרתם מהרשימה. לא אשלח לכם עוד מיילים.', // G7
  unsubBad: 'הקישור לא תקין.', // technical text, not in the approved copy: Udi to write
};
const CAL_URL = 'https://cal.com/asaf-yaniv-hlwofj/20min';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @param {import('../index.js').Env} env */
// The Notion properties must exist (GUIDE_NOTION_PROPS=1) before the feature turns on, so a consent and an unsubscribe always have a place to be recorded.
export const guideOn = (env) => Boolean(env.GUIDE_URL && env.GUIDE_UNSUB_SECRET && env.GUIDE_NOTION_PROPS === '1');

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);

/* ------------------------------------------------------------ signed links */

const enc = new TextEncoder();
/** @param {ArrayBuffer} buf */
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** @param {string} secret @param {string} data */
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

/** Unsubscribe token: "<session_id>.<signature>". It never expires: an unsubscribe link must keep working.
 * @param {import('../index.js').Env} env @param {string} sessionId */
export async function unsubToken(env, sessionId) {
  return `${sessionId}.${await hmac(String(env.GUIDE_UNSUB_SECRET), `unsub:${sessionId}`)}`;
}

/** @param {import('../index.js').Env} env @param {unknown} token @returns {Promise<string | null>} the session id, or null */
export async function verifyUnsubToken(env, token) {
  if (!env.GUIDE_UNSUB_SECRET) return null;
  const [sid, sig] = String(token ?? '').split('.');
  if (!sid || !sig || !UUID_RE.test(sid)) return null;
  const good = await hmac(env.GUIDE_UNSUB_SECRET, `unsub:${sid}`);
  if (good.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < good.length; i++) diff |= good.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? sid : null;
}

/* ------------------------------------------------------------------- email */

/** @param {import('../index.js').Env} env @param {string} to @param {string} name @param {string} unsubUrl */
async function sendGuideEmail(env, to, name, unsubUrl) {
  const url = String(env.GUIDE_URL);
  const safeName = name && name.length <= 40 ? name : '';
  const html =
    `<p>${esc(COPY.greeting(safeName))}</p>` +
    `<p>${esc(COPY.body)}</p>` +
    `<p><a href="${esc(url)}" style="display:inline-block;padding:10px 20px;background:#22335C;color:#ffffff;text-decoration:none;border-radius:8px">${esc(COPY.button)}</a></p>` +
    `<p>${esc(COPY.booking)} <a href="${CAL_URL}">${CAL_URL}</a></p>` +
    `<p style="color:#6b6258;font-size:13px">${esc(COPY.why)}<br>${esc(COPY.unsub)} <a href="${esc(unsubUrl)}">${esc(unsubUrl)}</a></p>` +
    `<p>${esc(COPY.signature)}</p>`;
  const text = [COPY.greeting(safeName), '', COPY.body, `${COPY.button}: ${url}`, '', `${COPY.booking} ${CAL_URL}`, '', COPY.why, `${COPY.unsub} ${unsubUrl}`, '', COPY.signature].join('\n');
  return sendToVisitor(env, to, COPY.subject, html, text);
}

/* ---------------------------------------------------------------- handlers */

/** Sessions that already got the email in this isolate: a best-effort guard for when the Notion property is not set up. */
/** @type {Map<string, number>} */
const sentMemory = new Map();

/** @param {Request} request @param {import('../index.js').Env} env */
export function handleGuideConfig(request, env) {
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const on = guideOn(env);
  // the guide link is never given out here: only to a visitor whose lead exists and who gave consent (POST /api/guide)
  return json({ ok: true, on });
}

/**
 * @param {Request} request @param {import('../index.js').Env} env @param {import('../index.js').Ctx} ctx
 */
export async function handleGuide(request, env, ctx) {
  const blocked = guard(request);
  if (blocked) return blocked;
  if (!guideOn(env)) return json({ ok: false, error: 'guide_off' }, 404);
  const body = await readJson(request);
  const sid = String(body?.session_id ?? '');
  if (!UUID_RE.test(sid)) return json({ ok: false, error: 'invalid_session', field: 'session_id' }, 400);
  if (body?.consent !== true) return json({ ok: false, error: 'consent_required' }, 400);
  const rl = await rateLimit(env, 'guide', clientIp(request));
  if (!rl.allowed) return limited(rl);

  const url = String(env.GUIDE_URL);
  const page = await findLeadBySession(env, sid).catch(logErr('notion lookup'));
  const lead = page ? pageToLead(page) : null;
  if (!lead?.email) return json({ ok: false, error: 'lead_not_found' }, 404);

  // one email per session unless asked again
  if (!body.resend && (lead.guide_sent_at || sentMemory.has(sid))) return json({ ok: true, url, already_sent: true });

  const origin = new URL(request.url).origin;
  const unsubUrl = `${origin}/api/guide/unsubscribe?t=${encodeURIComponent(await unsubToken(env, sid))}`;
  let sent = false;
  try {
    sent = await sendGuideEmail(env, lead.email, lead.name, unsubUrl);
  } catch (e) {
    console.error('[quiz] guide email failed:', /** @type {any} */ (e)?.message || e);
    return json({ ok: false, error: 'send_failed', url }, 502);
  }
  if (!sent) return json({ ok: false, error: 'email_not_configured', url }, 502);

  sentMemory.set(sid, Date.now());
  if (sentMemory.size > 2000) sentMemory.clear();
  if (page) {
    // a failed write is logged, never hidden: the sent date is what stops a second email
    ctx.waitUntil(updateLeadStrict(env, page.id, guideProps({ consent: true, sentAt: new Date().toISOString() })).catch(logErr('notion guide sent record')));
  }
  return json({ ok: true, url });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]{1,200}\.[^\s@]{2,}$/;

/**
 * POST /api/guide/signup  { email, consentAt, lang, source, website }
 * The guide form on the small business page: the visitor leaves an email and ticks the consent box. Creates (or
 * finds) the lead row, sends the one guide email, records the sent date. A filled honeypot gets a silent "ok".
 * @param {Request} request @param {import('../index.js').Env} env @param {import('../index.js').Ctx} ctx
 */
export async function handleGuideSignup(request, env, ctx) {
  const blocked = guard(request);
  if (blocked) return blocked;
  if (!guideOn(env)) return json({ ok: false, error: 'guide_off' }, 404);
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'invalid_json' }, 400);
  if (body.website) return json({ ok: true }); // honeypot: nothing stored or sent
  const email = String(body.email ?? '').trim().slice(0, 254);
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: 'invalid_email', field: 'email' }, 400);
  const consentAt = new Date(String(body.consentAt ?? ''));
  if (Number.isNaN(consentAt.getTime()) || Math.abs(Date.now() - consentAt.getTime()) > 36e5) return json({ ok: false, error: 'consent_required' }, 400);
  const rl = await rateLimit(env, 'guide', clientIp(request));
  if (!rl.allowed) return limited(rl);

  // reuse a lead that already has this address (for example from the quiz); otherwise make a new row
  let page = await findLeadByEmail(env, email).catch(logErr('notion email lookup'));
  let sid = page ? pageToLead(page).session_id : '';
  if (!UUID_RE.test(sid)) sid = crypto.randomUUID();
  let pageId = page?.id;
  if (!page) {
    const src = String(body.source ?? '').slice(0, 60);
    const created = await upsertLead(env, sid, {
      name: { title: [{ text: { content: email } }] },
      session_id: { rich_text: [{ text: { content: sid } }] },
      email: { email },
      status: { select: { name: 'guide-signup' } },
      utm_source: { rich_text: [{ text: { content: src ? `guide:${src}` : 'guide' } }] },
      guide_consent: { checkbox: true },
    }).catch(logErr('notion guide signup'));
    pageId = created?.id;
  }
  if (page && pageToLead(page).guide_sent_at) return json({ ok: true }); // already got it: no second email

  const origin = new URL(request.url).origin;
  const unsubUrl = `${origin}/api/guide/unsubscribe?t=${encodeURIComponent(await unsubToken(env, sid))}`;
  try {
    if (!(await sendGuideEmail(env, email, '', unsubUrl))) return json({ ok: false, error: 'email_not_configured' }, 502);
  } catch (e) {
    console.error('[quiz] guide signup email failed:', /** @type {any} */ (e)?.message || e);
    return json({ ok: false, error: 'send_failed' }, 502);
  }
  sentMemory.set(sid, Date.now());
  if (pageId) ctx.waitUntil(updateLeadStrict(env, pageId, guideProps({ consent: true, sentAt: new Date().toISOString() })).catch(logErr('notion guide sent record')));
  return json({ ok: true });
}

/** @param {string} line @param {number} status */
const unsubPage = (line, status) =>
  new Response(
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(line)}</title></head>` +
      `<body style="margin:0;background:#efe5da;color:#2E2B27;font-family:system-ui,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center"><p style="font-size:20px;padding:24px;text-align:center">${esc(line)}</p></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } },
  );

/**
 * @param {Request} request @param {import('../index.js').Env} env @param {import('../index.js').Ctx} ctx
 */
export async function handleGuideUnsubscribe(request, env, ctx) {
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  if (!guideOn(env)) return json({ ok: false, error: 'guide_off' }, 404);
  const sid = await verifyUnsubToken(env, new URL(request.url).searchParams.get('t'));
  if (!sid) return unsubPage(COPY.unsubBad, 400);

  ctx.waitUntil(
    (async () => {
      const now = new Date().toISOString();
      const page = await findLeadBySession(env, sid).catch(logErr('notion lookup'));
      let recorded = false;
      if (page) {
        try {
          await updateLeadStrict(env, page.id, guideProps({ consent: false, unsubscribedAt: now }));
          recorded = true;
        } catch (e) {
          console.error('[quiz] notion unsubscribe record failed:', /** @type {any} */ (e)?.message || e);
        }
      }
      if (!recorded) {
        // the record could not be stored: tell Asaf, so the request is never lost
        const lead = page ? pageToLead(page) : null;
        await sendOwnerNote(env, 'הסרה מרשימת המדריך (לא נשמרה ב-Notion, צריך לטפל ידנית)', [
          ['מייל', lead?.email || '—'],
          ['שם', lead?.name || '—'],
          ['סשן', sid],
          ['מתי', now],
        ]).catch(logErr('unsubscribe note'));
      }
    })(),
  );
  return unsubPage(COPY.unsubDone, 200);
}
