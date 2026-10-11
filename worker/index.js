// @ts-check
// Worker entry. Static assets are served first by the platform; this only runs on
// asset misses. /api/quiz* is handled here, everything else falls through to ASSETS
// so the site behaves exactly as it did before the Worker existed.
import { handleQuiz, handleClick } from './quiz/handlers.js';

/**
 * @typedef {Object} Env
 * @property {{ fetch: (req: Request) => Promise<Response> }} ASSETS
 * @property {{ limit: (o: { key: string }) => Promise<{ success: boolean }> }} [QUIZ_RATE_LIMITER]
 * @property {string} [ANTHROPIC_API_KEY]
 * @property {string} [ANTHROPIC_MODEL]
 * @property {string} [ANTHROPIC_BASE_URL]
 * @property {string} [QUIZ_LLM_EFFORT]
 * @property {string} [QUIZ_LLM_TIMEOUT_MS]
 * @property {string} [QUIZ_LLM_FALLBACKS]
 * @property {string} [NOTION_TOKEN]
 * @property {string} [NOTION_LEADS_DB_ID]
 * @property {string} [RESEND_API_KEY]
 * @property {string} [LEAD_EMAIL_FROM]
 * @property {string} [LEAD_EMAIL_TO]
 */

/** @typedef {{ waitUntil: (p: Promise<any>) => void }} Ctx */

export default {
  /** @param {Request} request @param {Env} env @param {Ctx} ctx */
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/quiz') return handleQuiz(request, env, ctx);
    if (pathname === '/api/quiz/click') return handleClick(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};
