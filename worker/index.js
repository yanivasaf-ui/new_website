// @ts-check
// Worker entry. Static assets are served first by the platform; this only runs on
// asset misses. /api/analyze* is handled here, everything else falls through to ASSETS
// so the site behaves exactly as it did before the Worker existed.
import { handleAnalyze, handleClick } from './quiz/handlers.js';
import { handleGuide, handleGuideConfig, handleGuideUnsubscribe } from './quiz/guide.js';

export { RateLimiter } from './quiz/ratelimit.js';

/**
 * @typedef {Object} Env
 * @property {{ fetch: (req: Request) => Promise<Response> }} ASSETS
 * @property {{ idFromName: (name: string) => any, get: (id: any) => { fetch: (url: string, init?: any) => Promise<Response> } }} [RATE_LIMITER]
 * @property {string} [ANTHROPIC_API_KEY]
 * @property {string} [ANTHROPIC_MODEL]
 * @property {string} [ANTHROPIC_BASE_URL]
 * @property {string} [QUIZ_LLM_EFFORT]
 * @property {string} [QUIZ_LLM_TIMEOUT_MS]
 * @property {string} [QUIZ_LLM_FALLBACKS]
 * @property {string} [QUIZ_TEMPLATE_FALLBACK]
 * @property {string} [NOTION_TOKEN]
 * @property {string} [NOTION_QUIZ_DB_ID]
 * @property {string} [NOTION_BASE_URL]
 * @property {string} [RESEND_API_KEY]
 * @property {string} [LEAD_EMAIL_FROM]
 * @property {string} [LEAD_EMAIL_TO]
 * @property {string} [RESEND_BASE_URL] tests only (a fake Resend)
 * @property {string} [GUIDE_URL] public link to the guide PDF. Unset = the whole guide feature is off
 * @property {string} [GUIDE_UNSUB_SECRET] signs the unsubscribe links. Unset = the guide feature is off
 * @property {string} [GUIDE_NOTION_PROPS] "1" once the Notion properties guide_consent, guide_sent_at and guide_unsubscribed_at exist
 */

/** @typedef {{ waitUntil: (p: Promise<any>) => void }} Ctx */

export default {
  /** @param {Request} request @param {Env} env @param {Ctx} ctx */
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/analyze') return handleAnalyze(request, env, ctx);
    if (pathname === '/api/analyze/click') return handleClick(request, env, ctx);
    if (pathname === '/api/guide') return handleGuide(request, env, ctx);
    if (pathname === '/api/guide/config') return handleGuideConfig(request, env);
    if (pathname === '/api/guide/unsubscribe') return handleGuideUnsubscribe(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};
