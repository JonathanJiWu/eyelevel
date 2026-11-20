/**
 * API rate limiting, two layers:
 *
 * 1. A token bucket per client IP in this server instance (always on):
 *    absorbs bursts cheaply, but serverless platforms run many instances.
 * 2. Optionally, a fixed-window counter per client IP shared by every
 *    instance, kept in Redis through the Upstash REST API (works from any
 *    Node or serverless runtime, no connection pooling). Enabled when
 *    UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or the Vercel KV
 *    names KV_REST_API_URL + KV_REST_API_TOKEN) are set. If Redis is slow or
 *    unreachable the request is allowed (fail open): an outage of the limiter
 *    must not take the API down.
 *
 * Shared keys contain a SHA-256 hash of the IP, never the address itself.
 */

export type LimitResult = { ok: true } | { ok: false; retryAfter: number };

const envNumber = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

// ---------------------------------------------------------------------------
// Layer 1: per-instance token bucket.
// ---------------------------------------------------------------------------
const buckets = new Map<string, { tokens: number; updatedAt: number }>();

export function takeToken(key: string, now = Date.now()): LimitResult {
  const capacity = envNumber("API_RATE_LIMIT_BURST", 120);
  const refillPerSecond = envNumber("API_RATE_LIMIT_PER_SECOND", 4);
  const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: now };
  const elapsed = Math.max(0, now - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSecond);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return { ok: false, retryAfter: Math.ceil((1 - bucket.tokens) / refillPerSecond) };
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  if (buckets.size > 10_000) {
    // Drop the oldest half to bound memory.
    const keys = [...buckets.keys()].slice(0, 5_000);
    for (const k of keys) buckets.delete(k);
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Layer 2: shared fixed window in Redis (Upstash REST).
// ---------------------------------------------------------------------------
interface SharedConfig {
  url: string;
  token: string;
  windowSeconds: number;
  limit: number;
  timeoutMs: number;
  prefix: string;
}

export function sharedLimiterConfig(): SharedConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return {
    url: url.replace(/\/+$/, ""),
    token,
    windowSeconds: envNumber("API_RATE_LIMIT_WINDOW_SECONDS", 60),
    limit: envNumber("API_RATE_LIMIT_PER_WINDOW", 300),
    timeoutMs: envNumber("API_RATE_LIMIT_TIMEOUT_MS", 500),
    prefix: process.env.API_RATE_LIMIT_PREFIX || "eyelevel:rl",
  };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

let lastWarning = 0;
function warnOnce(message: string) {
  const now = Date.now();
  if (now - lastWarning < 60_000) return;
  lastWarning = now;
  console.warn(`[rate-limit] ${message}; allowing requests (fail open).`);
}

/** Count this request in the shared window. Never throws. */
export async function takeShared(key: string, config: SharedConfig, now = Date.now()): Promise<LimitResult> {
  const windowMs = config.windowSeconds * 1000;
  const window = Math.floor(now / windowMs);
  const redisKey = `${config.prefix}:${(await sha256Hex(key)).slice(0, 32)}:${window}`;
  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      // Create the counter with an expiry if it doesn't exist, then count.
      body: JSON.stringify([
        ["SET", redisKey, "0", "EX", String(config.windowSeconds + 1), "NX"],
        ["INCR", redisKey],
      ]),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) {
      warnOnce(`shared limiter returned HTTP ${response.status}`);
      return { ok: true };
    }
    const body = (await response.json()) as { result?: unknown; error?: string }[];
    const count = Array.isArray(body) ? Number(body[1]?.result) : NaN;
    if (!Number.isFinite(count)) {
      warnOnce(`shared limiter returned an unexpected response${Array.isArray(body) && body[1]?.error ? ` (${body[1].error})` : ""}`);
      return { ok: true };
    }
    if (count > config.limit) {
      return { ok: false, retryAfter: Math.max(1, Math.ceil(((window + 1) * windowMs - now) / 1000)) };
    }
    return { ok: true };
  } catch (error) {
    warnOnce(`shared limiter unavailable (${(error as Error).name === "TimeoutError" ? "timeout" : (error as Error).message})`);
    return { ok: true };
  }
}

/** Both layers: the local bucket first (no network), then the shared window if configured. */
export async function checkRateLimit(key: string): Promise<LimitResult> {
  const local = takeToken(key);
  if (!local.ok) return local;
  const shared = sharedLimiterConfig();
  return shared ? takeShared(key, shared) : local;
}

export function __resetRateLimits() {
  buckets.clear();
  lastWarning = 0;
}
