/**
 * Helpers shared by the /api route handlers: JSON responses, error mapping,
 * input validation, cache headers and per-client rate limiting.
 */
import { FilterValidationError } from "@/src/lib/filters";
import { checkRateLimit } from "./rateLimit";
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

/** Optional cursor for filtered search (see MoviePage.nextStart). */
export function parseStart(value: string | null, max: number): number | null {
  if (value === null || value === "") return null;
  if (!/^\d{1,6}$/.test(value) || Number(value) > max) throw new BadRequestError(`"start" must be a whole number between 0 and ${max}.`);
  return Number(value);
}

export function parseMovieId(value: string | undefined): number {
  if (!value || !/^\d{1,9}$/.test(value) || Number(value) < 1) {
    throw new BadRequestError("Movie id must be a positive whole number.");
  }
  return Number(value);
}

// ---------------------------------------------------------------------------
// Rate limiting: see rateLimit.ts (per-instance bucket + optional shared
// window across instances). CDN caching (s-maxage) absorbs most repeated
// traffic before it reaches the API.
// ---------------------------------------------------------------------------
export { __resetRateLimits } from "./rateLimit";

/**
 * Client address for rate limiting. Clients can put anything at the start of
 * X-Forwarded-For, so use the value added by the platform: Vercel's own
 * header, otherwise the LAST X-Forwarded-For entry (appended by the proxy in
 * front of the Node server).
 */
export function clientKey(request: Request): string {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return request.headers.get("x-real-ip") ?? "local";
}

/** Wrap an API handler with rate limiting and consistent error responses. */
export async function handle(request: Request, fn: (url: URL) => Promise<Response>): Promise<Response> {
  const limit = await checkRateLimit(clientKey(request));
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
