// @ts-check
import { validateSubmission, validateClick, isHoneypot } from './validate.js';
import { rateLimit } from './ratelimit.js';
import { upsertLead, findLeadBySession, updateLead, leadProps, pageToLead } from './notion.js';
import { sendLeadEmail, sendClickEmail } from './email.js';
import { analyze, analysisToText } from './analysis.js';

const MAX_BODY = 16_000;
const ALLOWED_ORIGINS = [/^https:\/\/(www\.)?ensemble-ai\.io$/, /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

/** @param {any} data @param {number} [status] */
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });

/** @param {string} what */
const logErr = (what) => (/** @type {any} */ e) => {
  console.error(`[quiz] ${what} failed:`, e?.message || e);
  return null;
};

/** Method, origin and per-IP rate limit. Returns a Response to short-circuit, or null. */
async function guard(/** @type {Request} */ request, /** @type {import('../index.js').Env} */ env) {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const origin = request.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.some((re) => re.test(origin))) return json({ ok: false, error: 'forbidden_origin' }, 403);
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  if (!(await rateLimit(env, ip))) return json({ ok: false, error: 'rate_limited' }, 429);
  return null;
}

/** @param {Request} request */
async function readJson(request) {
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return null;
  const raw = await request.text();
  if (raw.length > MAX_BODY) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * POST /api/quiz
 * stage=partial  -> upsert anonymous progress row (from Q3 on), no analysis.
 * stage=complete -> upsert lead BEFORE the LLM call, analyze, return result;
 *                   analysis write-back + email run after the response.
 * @param {Request} request @param {import('../index.js').Env} env @param {import('../index.js').Ctx} ctx
 */
export async function handleQuiz(request, env, ctx) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'invalid_json' }, 400);
  // Bots get a normal-looking success and nothing is stored or sent.
  if (isHoneypot(body)) return json({ ok: true });

  const v = validateSubmission(body);
  if (v.ok === false) return json({ ok: false, error: v.error, field: v.field }, 400);
  const sub = v.value;

  if (sub.stage === 'partial') {
    // Awaited so the client can serialize calls and avoid duplicate rows for one session.
    await upsertLead(env, sub.session_id, leadProps(sub, { status: 'partial' })).catch(logErr('notion partial'));
    return json({ ok: true });
  }

  const pageId = await upsertLead(env, sub.session_id, leadProps(sub, { status: 'complete' })).catch(logErr('notion create'));
  const analysis = await analyze(env, sub);
  const { first_step } = analysis.result;

  ctx.waitUntil(
    (async () => {
      const extra = {
        status: 'complete',
        recommended_solution: first_step.solution_id,
        analysis: analysisToText(analysis.result),
        analysis_source: analysis.source,
      };
      if (pageId) await updateLead(env, pageId, leadProps(sub, extra)).catch(logErr('notion analysis update'));
      else await upsertLead(env, sub.session_id, leadProps(sub, extra)).catch(logErr('notion late create'));
      await sendLeadEmail(env, sub, { solutionId: first_step.solution_id, solutionTitle: first_step.title, source: analysis.source }).catch(
        logErr('lead email'),
      );
    })(),
  );

  return json({ ok: true, source: analysis.source, result: analysis.result });
}

/**
 * POST /api/quiz/click  { session_id }
 * @param {Request} request @param {import('../index.js').Env} env @param {import('../index.js').Ctx} ctx
 */
export async function handleClick(request, env, ctx) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  const body = await readJson(request);
  const v = validateClick(body);
  if (!v.ok) return json({ ok: false, error: 'invalid_session', field: 'session_id' }, 400);

  ctx.waitUntil(
    (async () => {
      const page = await findLeadBySession(env, v.session_id).catch(logErr('notion lookup'));
      if (page) await updateLead(env, page.id, { booking_clicked: { checkbox: true }, status: { select: { name: 'booked-click' } } }).catch(logErr('notion click update'));
      await sendClickEmail(env, page ? pageToLead(page) : { session_id: v.session_id }).catch(logErr('click email'));
    })(),
  );
  return json({ ok: true });
}
