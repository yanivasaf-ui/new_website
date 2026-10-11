// @ts-check
// Analysis engine: shortlist -> one LLM call (structured JSON) -> validate -> one retry ->
// template fallback. The user always gets a result.
import Anthropic from '@anthropic-ai/sdk';
import { buildShortlist } from './shortlist.js';
import { SYSTEM_PROMPT, outputSchema, userMessage } from './prompt.js';
import { checkResult } from './check.js';
import { templateResult } from './template.js';

const DEFAULT_MODEL = 'claude-opus-5-5';
const DEFAULT_TIMEOUT_MS = 12_000;
/** Don't start the retry unless at least this much of the budget is left. */
const MIN_RETRY_BUDGET_MS = 4_000;

/**
 * @typedef {Object} AnalysisResult
 * @property {string} what_i_saw
 * @property {string} biggest_leak
 * @property {string} estimate_note
 * @property {{ solution_id: string, title: string, description: string, week1: string }} first_step
 * @property {string} next_step
 *
 * @typedef {Object} Analysis
 * @property {'llm'|'template'} source
 * @property {AnalysisResult} result
 * @property {string[]} shortlist
 * @property {string[]} trace       shortlist rule trace
 * @property {string} [reason]      LLM's internal reason for the pick
 * @property {string[]} [errors]    why the LLM path was abandoned (if it was)
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
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: user }],
    output_config: {
      effort: env.QUIZ_LLM_EFFORT || 'low',
      format: { type: 'json_schema', schema: outputSchema(shortlist) },
    },
  };
  const useFallbacks = (env.QUIZ_LLM_FALLBACKS || 'default') !== 'off';
  const res = /** @type {any} */ (
    useFallbacks
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
  const fallback = (/** @type {string[]} */ errors) => ({
    source: /** @type {const} */ ('template'),
    result: templateResult(a, shortlist),
    shortlist,
    trace,
    errors,
    ms: Date.now() - started,
  });

  if (!env.ANTHROPIC_API_KEY) return fallback(['ANTHROPIC_API_KEY not set']);

  const budget = Number(env.QUIZ_LLM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const deadline = started + budget;
  /** @type {string[]} */
  const errors = [];
  let previous = undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = deadline - Date.now();
    if (attempt === 2 && remaining < MIN_RETRY_BUDGET_MS) {
      errors.push(`no budget for retry (${remaining}ms left)`);
      break;
    }
    try {
      const out = await callModel(env, userMessage(a, shortlist, previous), shortlist, remaining);
      const check = checkResult(out, shortlist);
      if (check.ok) {
        const { reason, ...result } = out;
        return { source: 'llm', result, shortlist, trace, reason, errors, ms: Date.now() - started };
      }
      errors.push(`attempt ${attempt} invalid: ${check.errors.join('; ')}`);
      previous = check.errors;
    } catch (e) {
      const msg = e?.name === 'APIConnectionTimeoutError' || /timed? ?out/i.test(String(e?.message)) ? 'timeout' : String(e?.message || e).slice(0, 200);
      errors.push(`attempt ${attempt} failed: ${msg}`);
      // A timeout means the budget is gone; other errors (bad JSON, 5xx) may be worth one retry.
      if (msg === 'timeout') break;
    }
  }
  console.warn('[quiz] LLM path abandoned, using template:', errors.join(' | '));
  return fallback(errors);
}

/** Flattens a result into plain text for the Notion `analysis` field. @param {Analysis} an */
export function analysisToText(an) {
  const r = an.result;
  return [
    `מה ראיתי: ${r.what_i_saw}`,
    `המקום הכי יקר: ${r.biggest_leak} (${r.estimate_note})`,
    `הצעד הראשון: ${r.first_step.title}. ${r.first_step.description} שבוע ראשון: ${r.first_step.week1}`,
    `ומה אחר כך: ${r.next_step}`,
    `---`,
    `source: ${an.source} · shortlist: ${an.shortlist.join(', ')}${an.reason ? ` · reason: ${an.reason}` : ''}`,
    an.errors?.length ? `llm errors: ${an.errors.join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
