// @ts-check
// Per-IP hourly rate limits. Cloudflare's built-in rate-limit binding only supports 10s/60s
// windows, so hourly limits live in a small Durable Object (one instance per bucket + IP).

const HOUR = 3_600_000;
/** @type {Record<string, { limit: number, windowMs: number }>} */
export const LIMITS = {
  analyze: { limit: 5, windowMs: HOUR }, // completed submissions (LLM call)
  partial: { limit: 60, windowMs: HOUR }, // anonymous progress saves
  click: { limit: 30, windowMs: HOUR }, // booking-click beacons
};

/** Sliding-window hit log for one key. */
export class RateLimiter {
  /** @param {any} state */
  constructor(state) {
    this.state = state;
  }

  /** @param {Request} request */
  async fetch(request) {
    const { limit, windowMs } = /** @type {{ limit: number, windowMs: number }} */ (await request.json());
    const now = Date.now();
    /** @type {number[]} */
    const hits = ((await this.state.storage.get('hits')) || []).filter((t) => now - t < windowMs);
    const allowed = hits.length < limit;
    if (allowed) hits.push(now);
    await this.state.storage.put('hits', hits);
    const retryAfter = allowed ? 0 : Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
    return Response.json({ allowed, retryAfter });
  }
}

/** @type {Map<string, number[]>} */
const memory = new Map();

/**
 * @param {import('../index.js').Env} env
 * @param {'analyze'|'partial'|'click'} bucket
 * @param {string} ip
 * @returns {Promise<{ allowed: boolean, retryAfter: number }>}
 */
export async function rateLimit(env, bucket, ip) {
  const { limit, windowMs } = LIMITS[bucket];
  if (env.RATE_LIMITER) {
    try {
      const stub = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(`${bucket}:${ip}`));
      const res = await stub.fetch('https://rate-limiter/hit', { method: 'POST', body: JSON.stringify({ limit, windowMs }) });
      return /** @type {{ allowed: boolean, retryAfter: number }} */ (await res.json());
    } catch (e) {
      console.warn('[quiz] rate limiter DO failed, using per-isolate fallback:', e?.message || e);
    }
  }
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const hits = (memory.get(key) || []).filter((t) => now - t < windowMs);
  const allowed = hits.length < limit;
  if (allowed) hits.push(now);
  memory.set(key, hits);
  if (memory.size > 5000) memory.clear();
  return { allowed, retryAfter: allowed ? 0 : Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)) };
}
