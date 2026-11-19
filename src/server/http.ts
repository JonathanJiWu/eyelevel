/**
 * Helpers shared by the /api route handlers: JSON responses, error mapping,
 * input validation, cache headers and a best-effort per-client rate limiter.
 */
import { FilterValidationError } from "@/src/lib/filters";
import { TmdbError } from "./tmdb";

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export const CACHE = {
  list: "public, max-age=60, s-maxage=600, stale-while-revalidate=3600",
  details: "public, max-age=600, s-maxage=21600, stale-while-revalidate=86400",
  reference: "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
  none: "no-store",
} as const;

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export function json(body: unknown, init: { status?: number; cache?: string; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": init.cache ?? CACHE.none,
      ...SECURITY_HEADERS,
      ...init.headers,
    },
  });
}

export function errorResponse(status: number, code: string, message: string, headers: Record<string, string> = {}) {
  return json({ error: { code, message } }, { status, cache: CACHE.none, headers });
}

export function parsePage(value: string | null): number {
  if (value === null || value === "") return 1;
  if (!/^\d+$/.test(value)) throw new BadRequestError('"page" must be a positive whole number.');
  const page = Number(value);
  if (page < 1 || page > 500) throw new BadRequestError('"page" must be between 1 and 500.');
  return page;
}

export function parseMovieId(value: string | undefined): number {
  if (!value || !/^\d{1,9}$/.test(value) || Number(value) < 1) {
    throw new BadRequestError("Movie id must be a positive whole number.");
  }
  return Number(value);
}

// ---------------------------------------------------------------------------
// Rate limiting (token bucket per client IP). In serverless deployments this
// is per instance, so it is a safety net against abuse, not a global quota;
// CDN caching (s-maxage) absorbs most repeated traffic.
// ---------------------------------------------------------------------------
const BUCKET_CAPACITY = Number(process.env.API_RATE_LIMIT_BURST) || 120;
const REFILL_PER_SECOND = Number(process.env.API_RATE_LIMIT_PER_SECOND) || 4;
const buckets = new Map<string, { tokens: number; updatedAt: number }>();

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "local";
}

export function takeToken(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfter: number } {
  const bucket = buckets.get(key) ?? { tokens: BUCKET_CAPACITY, updatedAt: now };
  const elapsed = Math.max(0, now - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + elapsed * REFILL_PER_SECOND);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return { ok: false, retryAfter: Math.ceil((1 - bucket.tokens) / REFILL_PER_SECOND) };
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

export function __resetRateLimits() {
  buckets.clear();
}

/** Wrap an API handler with rate limiting and consistent error responses. */
export async function handle(request: Request, fn: (url: URL) => Promise<Response>): Promise<Response> {
  const limit = takeToken(clientKey(request));
  if (!limit.ok) {
    return errorResponse(429, "rate_limited", "Too many requests. Please slow down.", {
      "Retry-After": String(limit.retryAfter),
    });
  }
  try {
    return await fn(new URL(request.url));
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof FilterValidationError) {
      return errorResponse(400, "invalid_request", error.message);
    }
    if (error instanceof TmdbError) {
      const headers: Record<string, string> = {};
      if (error.retryAfterSeconds) headers["Retry-After"] = String(error.retryAfterSeconds);
      return errorResponse(error.status, error.code, error.message, headers);
    }
    console.error("[api] Unexpected error:", error);
    return errorResponse(500, "internal_error", "Something went wrong on our side.");
  }
}
