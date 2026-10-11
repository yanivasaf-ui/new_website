// @ts-check
// Notion leads table: one page per quiz session, keyed by the session_id property.
// Property names/types the database must have are listed in QUIZ.md.

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const TIMEOUT_MS = 6000;

/** @param {import('../index.js').Env} env */
export const notionConfigured = (env) => Boolean(env.NOTION_TOKEN && env.NOTION_LEADS_DB_ID);

/** @param {import('../index.js').Env} env @param {string} path @param {string} method @param {any} body */
async function notion(env, path, method, body) {
  const res = await fetch(NOTION_API + path, {
    method,
    headers: {
      authorization: `Bearer ${env.NOTION_TOKEN}`,
      'notion-version': NOTION_VERSION,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`notion ${method} ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** Notion caps each rich_text item at 2000 chars. @param {string} s */
const text = (s) => ({
  rich_text: (String(s || '').match(/[\s\S]{1,2000}/g) || []).slice(0, 50).map((c) => ({ text: { content: c } })),
});
/** @param {string} s */
const select = (s) => ({ select: s ? { name: s } : null });

/**
 * Builds Notion properties from a submission. Option ids (not Hebrew labels) are stored
 * in selects because Notion option names cannot contain commas.
 * @param {import('./validate.js').Submission} sub
 * @param {{ status?: string, recommended_solution?: string, analysis?: string, analysis_source?: string, booking_clicked?: boolean }} extra
 */
export function leadProps(sub, extra = {}) {
  const a = sub.answers;
  /** @type {Record<string, any>} */
  const p = {
    session_id: text(sub.session_id),
    industry: select(a.industry),
    size: select(a.size),
    channels: { multi_select: (a.channels || []).map((name) => ({ name })) },
    utm_source: text(sub.utm.source),
    utm_medium: text(sub.utm.medium),
    utm_campaign: text(sub.utm.campaign),
    device: select(sub.device),
  };
  if (a.acquisition) p.acquisition = select(a.acquisition);
  if (a.sink) p.sink = select(a.sink);
  if (a.hours) p.hours = select(a.hours);
  if (a.pain || a.industry_other) p.pain = text([a.industry_other && `[תחום: ${a.industry_other}]`, a.pain].filter(Boolean).join(' '));
  if (sub.contact) {
    p.name = { title: [{ text: { content: sub.contact.name } }] };
    p.whatsapp = { phone_number: sub.contact.whatsapp_e164 };
    p.email = { email: sub.contact.email || null };
    p.consent = { checkbox: sub.contact.consent };
  }
  if (extra.status) p.status = select(extra.status);
  if (extra.recommended_solution) p.recommended_solution = select(extra.recommended_solution);
  if (extra.analysis) p.analysis = text(extra.analysis);
  if (extra.analysis_source) p.analysis_source = select(extra.analysis_source);
  if (extra.booking_clicked != null) p.booking_clicked = { checkbox: extra.booking_clicked };
  return p;
}

/** @param {import('../index.js').Env} env @param {string} sessionId */
export async function findLeadBySession(env, sessionId) {
  if (!notionConfigured(env)) return null;
  const r = await notion(env, `/databases/${env.NOTION_LEADS_DB_ID}/query`, 'POST', {
    filter: { property: 'session_id', rich_text: { equals: sessionId } },
    page_size: 1,
  });
  return r.results?.[0] || null;
}

/** @param {import('../index.js').Env} env @param {string} pageId @param {Record<string, any>} properties */
export async function updateLead(env, pageId, properties) {
  if (!notionConfigured(env)) return null;
  return notion(env, `/pages/${pageId}`, 'PATCH', { properties });
}

/**
 * Creates the session's page or updates it. Returns the page id (null when Notion is not configured).
 * @param {import('../index.js').Env} env @param {string} sessionId @param {Record<string, any>} properties
 */
export async function upsertLead(env, sessionId, properties) {
  if (!notionConfigured(env)) {
    console.warn('notion not configured (NOTION_TOKEN / NOTION_LEADS_DB_ID); lead not stored');
    return null;
  }
  const existing = await findLeadBySession(env, sessionId);
  if (existing) {
    await updateLead(env, existing.id, properties);
    return existing.id;
  }
  /** @type {Record<string, any>} */
  const props = { ...properties, created: { date: { start: new Date().toISOString() } } };
  if (!props.name) props.name = { title: [{ text: { content: `anon-${sessionId.slice(0, 8)}` } }] };
  const page = await notion(env, '/pages', 'POST', { parent: { database_id: env.NOTION_LEADS_DB_ID }, properties: props });
  return page.id;
}

/** Reads the fields the click email needs back out of a Notion page. @param {any} page */
export function pageToLead(page) {
  const p = page?.properties || {};
  const plain = (prop) => (prop?.title || prop?.rich_text || []).map((t) => t.plain_text).join('');
  return {
    name: plain(p.name),
    whatsapp: p.whatsapp?.phone_number || '',
    industry: p.industry?.select?.name || '',
    size: p.size?.select?.name || '',
    sink: p.sink?.select?.name || '',
    recommended_solution: p.recommended_solution?.select?.name || '',
    url: page?.url || '',
  };
}
