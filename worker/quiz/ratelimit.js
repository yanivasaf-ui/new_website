// @ts-check
// Per-IP rate limit. Uses the QUIZ_RATE_LIMITER binding (wrangler.toml) when present,
// otherwise a best-effort per-isolate window so local dev and misconfigured envs still limit.

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
/** @type {Map<string, { start: number, count: number }>} */
const memory = new Map();

/** @param {import('../index.js').Env} env @param {string} key @returns {Promise<boolean>} allowed */
export async function rateLimit(env, key) {
  if (env.QUIZ_RATE_LIMITER) {
    try {
      const { success } = await env.QUIZ_RATE_LIMITER.limit({ key });
      return success;
    } catch (e) {
      console.warn('ratelimit binding failed, using memory fallback', e);
    }
  }
  const now = Date.now();
  const slot = memory.get(key);
  if (!slot || now - slot.start > WINDOW_MS) {
    memory.set(key, { start: now, count: 1 });
    if (memory.size > 5000) memory.clear();
    return true;
  }
  slot.count += 1;
  return slot.count <= MAX_PER_WINDOW;
}
