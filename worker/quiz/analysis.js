// @ts-check
// Analysis engine: shortlist -> LLM call (structured JSON) -> validate. Two attempts at most:
// the second runs after a timeout, an API error, or output that fails validation.
// If both attempts fail the user still gets a result: a template built from the shortlist
// (QUIZ_TEMPLATE_FALLBACK=0 turns this off). The analysis only fails, and the page shows
// "משהו נתקע בדרך", when the template cannot be built or fails the same validation.
import Anthropic from '@anthropic-ai/sdk';
import { buildShortlist } from './shortlist.js';
import { SYSTEM_PROMPT, outputSchema, userMessage } from './prompt.js';
import { checkResult } from './check.js';
import { templateResult } from './template.js';
import { solution } from './catalog.js';

/**
 * Template result that passes the same checks as LLM output, or null.
 * The template quotes the owner's own words; if that quote trips a check (English text, a banned
 * word), retry without the quote and the free-text business type before giving up.
 * @param {import('./validate.js').Answers} a @param {string[]} shortlist
 */
export function safeTemplate(a, shortlist) {
  for (const answers of [a, { ...a, pain: '', industry_other: '' }]) {
    try {
      const result = templateResult(answers, shortlist);
      if (checkResult(result, shortlist).ok) return result;
    } catch (e) {
      console.error('[quiz] template failed:', e?.message || e);
    }
  }
  return null;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
/** Timeout PER ATTEMPT (QUIZ_LLM_TIMEOUT_MS overrides). Worst case is two attempts, so 2 x this. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * @typedef {Object} AnalysisResult
 * @property {string} what_i_saw
 * @property {string} biggest_leak
 * @property {string} estimate_note
 * @property {{ solution_id: string, name: string, does: string, days: number, week1: string }} product  the named product Ensemble builds
 *
 * @typedef {Object} Analysis
 * @property {boolean} ok
 * @property {'llm'|'template'|'failed'} source
 * @property {AnalysisResult} [result]    present when ok
 * @property {string[]} shortlist
 * @property {string[]} trace             shortlist rule trace
 * @property {string} [reason]            LLM's internal reason for the pick
 * @property {string[]} [errors]          why the LLM path was abandoned (if it was)
 * @property {number} [ms]
 */

/**
 * One Messages API call with structured output. Throws on API error/timeout/refusal.
 * @param {import('../index.js').Env} env @param {string} user @param {string[]} shortlist @param {number} timeoutMs
 */
async function callModel(env, user, shortlist, timeoutMs) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined, maxRetries: 0 });
  const params = {
    model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: user }],
    output_config: {
      ...(env.QUIZ_LLM_EFFORT ? { effort: env.QUIZ_LLM_EFFORT } : {}),
      format: { type: 'json_schema', schema: outputSchema(shortlist) },
    },
  };
  // Server-side refusal fallback is only for the newest models; opt in with QUIZ_LLM_FALLBACKS=default.
  const res = /** @type {any} */ (
    env.QUIZ_LLM_FALLBACKS === 'default'
      ? await client.beta.messages.create(
          /** @type {any} */ ({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
          { timeout: timeoutMs },
        )
      : await client.messages.create(/** @type {any} */ (params), { timeout: timeoutMs })
  );
  if (res.stop_reason === 'refusal') throw new Error(`refusal (${res.stop_details?.category ?? 'unknown'})`);
  if (res.stop_reason === 'max_tokens') throw new Error('max_tokens reached');
  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

/**
 * @param {import('../index.js').Env} env
 * @param {import('./validate.js').Submission} sub
 * @returns {Promise<Analysis>}
 */
export async function analyze(env, sub) {
  const started = Date.now();
  const a = sub.answers;
  const { ids: shortlist, trace } = buildShortlist(a);
  const giveUp = (/** @type {string[]} */ errors) => {
    console.warn('[quiz] LLM path abandoned:', errors.join(' | '));
    const result = env.QUIZ_TEMPLATE_FALLBACK === '0' ? null : safeTemplate(a, shortlist);
    return result
      ? /** @type {Analysis} */ ({ ok: true, source: 'template', result, shortlist, trace, errors, ms: Date.now() - started })
      : /** @type {Analysis} */ ({ ok: false, source: 'failed', shortlist, trace, errors, ms: Date.now() - started });
  };

  if (!env.ANTHROPIC_API_KEY) return giveUp(['ANTHROPIC_API_KEY not set']);

  const perAttempt = Number(env.QUIZ_LLM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  /** @type {string[]} */
  const errors = [];
  /** @type {string[] | undefined} */
  let previous = undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const out = await callModel(env, userMessage(a, shortlist, previous), shortlist, perAttempt);
      const check = checkResult(out, shortlist);
      if (check.ok) {
        const { reason, ...result } = out;
        // the build time is Ensemble's commitment, never the model's
        result.product.days = solution(result.product.solution_id)?.days ?? 5;
        return { ok: true, source: 'llm', result, shortlist, trace, reason, errors, ms: Date.now() - started };
      }
      errors.push(`attempt ${attempt} invalid: ${check.errors.join('; ')}`);
      previous = check.errors;
    } catch (e) {
      const msg = e?.name === 'APIConnectionTimeoutError' || /timed? ?out/i.test(String(e?.message)) ? `timeout after ${perAttempt}ms` : String(e?.message || e).slice(0, 200);
      errors.push(`attempt ${attempt} failed: ${msg}`);
    }
    if (attempt === 1) console.warn('[quiz] LLM attempt 1 did not produce a result, retrying once:', errors[errors.length - 1]);
  }
  return giveUp(errors);
}

/** Flattens an analysis into plain text for the Notion `analysis` field. @param {Analysis} an */
export function analysisToText(an) {
  const meta = `source: ${an.source} · ${an.ms ?? '?'}ms · shortlist: ${an.shortlist.join(', ')}${an.reason ? ` · reason: ${an.reason}` : ''}`;
  const errs = an.errors?.length ? `llm errors: ${an.errors.join(' | ')}` : '';
  if (!an.ok || !an.result) return ['ANALYSIS FAILED, follow up manually', meta, errs].filter(Boolean).join('\n');
  const r = an.result;
  return [
    `מה ראיתי: ${r.what_i_saw}`,
    `המקום הכי יקר: ${r.biggest_leak} (${r.estimate_note})`,
    `מה הייתי בונה: ${r.product.name}. ${r.product.does} נבנה ב-${r.product.days} ימים. שבוע ראשון: ${r.product.week1}`,
    '---',
    meta,
    errs,
  ]
    .filter(Boolean)
    .join('\n');
}
