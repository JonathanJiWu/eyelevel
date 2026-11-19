/**
 * Server-only TMDB client.
 *
 * - Credentials come from server environment variables (TMDB_API_KEY or
 *   TMDB_READ_ACCESS_TOKEN) and are never sent to the browser.
 * - Responses are cached in an LRU cache with TTLs; concurrent identical
 *   requests share one upstream call; stale data is served if TMDB fails.
 * - 429 / 5xx / network failures are retried with backoff (honoring
 *   Retry-After), and every request has a timeout.
 */
import { LruCache } from "@/src/lib/cache";

export class TmdbError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

export const TTL = {
  list: 10 * 60 * 1000,
  details: 6 * 60 * 60 * 1000,
  reference: 24 * 60 * 60 * 1000,
} as const;

const DEFAULT_BASE_URL = "https://api.themoviedb.org/3";

interface TmdbConfig {
  baseUrl: string;
  apiKey: string;
  readToken: string;
  language: string;
  timeoutMs: number;
  maxRetries: number;
}

function readConfig(): TmdbConfig {
  return {
    baseUrl: (process.env.TMDB_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    apiKey: (process.env.TMDB_API_KEY || "").trim(),
    readToken: (process.env.TMDB_READ_ACCESS_TOKEN || "").trim(),
    language: process.env.TMDB_LANGUAGE || "en-US",
    timeoutMs: Number(process.env.TMDB_TIMEOUT_MS) || 8000,
    maxRetries: process.env.TMDB_MAX_RETRIES !== undefined ? Number(process.env.TMDB_MAX_RETRIES) : 2,
  };
}

export function isTmdbConfigured(): boolean {
  const config = readConfig();
  return Boolean(config.apiKey || config.readToken);
}

const cache = new LruCache<unknown>(1500);
const inflight = new Map<string, Promise<unknown>>();
let upstreamCalls = 0;

/** Test/diagnostic helpers. */
export const __tmdbInternals = {
  clear() {
    cache.clear();
    inflight.clear();
    upstreamCalls = 0;
  },
  get upstreamCalls() {
    return upstreamCalls;
  },
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Params = Record<string, string | number | boolean | null | undefined>;

function buildUrl(config: TmdbConfig, path: string, params: Params): URL {
  const url = new URL(config.baseUrl + path);
  const entries = Object.entries({ language: config.language, ...params })
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of entries) url.searchParams.set(key, String(value));
  return url;
}

async function fetchOnce(url: URL, config: TmdbConfig): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const requestUrl = new URL(url);
  if (config.readToken) headers.Authorization = `Bearer ${config.readToken}`;
  else requestUrl.searchParams.set("api_key", config.apiKey);
  upstreamCalls++;
  return fetch(requestUrl, { headers, signal: AbortSignal.timeout(config.timeoutMs) });
}

function retryDelay(attempt: number, retryAfterHeader: string | null): number {
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, 3000);
  return Math.min(250 * 2 ** attempt, 2000) + Math.floor(Math.random() * 100);
}

async function fetchJson(url: URL, config: TmdbConfig): Promise<unknown> {
  let lastError: TmdbError | null = null;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    let response: Response;
    try {
      response = await fetchOnce(url, config);
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      lastError = new TmdbError(
        504,
        timedOut ? "upstream_timeout" : "upstream_unreachable",
        timedOut ? "The movie database took too long to respond." : "The movie database is unreachable right now.",
      );
      if (attempt < config.maxRetries) await sleep(retryDelay(attempt, null));
      continue;
    }

    if (response.ok) {
      try {
        return await response.json();
      } catch {
        throw new TmdbError(502, "upstream_invalid", "The movie database returned an invalid response.");
      }
    }

    if (response.status === 401) {
      console.error("[tmdb] Upstream rejected credentials (401). Check TMDB_API_KEY / TMDB_READ_ACCESS_TOKEN.");
      throw new TmdbError(502, "upstream_auth", "The movie database rejected the server's credentials.");
    }
    if (response.status === 404) {
      throw new TmdbError(404, "not_found", "That movie could not be found.");
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      lastError = new TmdbError(
        503,
        "rate_limited",
        "The movie database is busy. Please try again in a moment.",
        Number(retryAfter) || 2,
      );
      if (attempt < config.maxRetries) await sleep(retryDelay(attempt, retryAfter));
      continue;
    }
    if (response.status >= 500) {
      lastError = new TmdbError(502, "upstream_unavailable", "The movie database is having problems right now.");
      if (attempt < config.maxRetries) await sleep(retryDelay(attempt, response.headers.get("retry-after")));
      continue;
    }
    // Other 4xx: our request was malformed — do not retry.
    throw new TmdbError(502, "upstream_rejected", `The movie database rejected the request (${response.status}).`);
  }
  throw lastError ?? new TmdbError(502, "upstream_unavailable", "The movie database is unavailable.");
}

/**
 * GET a TMDB path with caching. The cache key never contains credentials.
 */
export async function tmdbGet<T = unknown>(path: string, params: Params, ttlMs: number): Promise<T> {
  const config = readConfig();
  if (!config.apiKey && !config.readToken) {
    throw new TmdbError(503, "not_configured", "Movie data is not configured on the server (missing TMDB credentials).");
  }
  const url = buildUrl(config, path, params);
  const key = url.toString();

  const fresh = cache.get(key);
  if (fresh !== undefined) return fresh as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const request = (async () => {
    try {
      const data = await fetchJson(url, config);
      cache.set(key, data, ttlMs);
      return data;
    } catch (error) {
      const stale = cache.getStale(key);
      if (stale !== undefined && error instanceof TmdbError && error.code !== "not_found") {
        console.warn(`[tmdb] Serving stale data for ${path}: ${error.code}`);
        return stale;
      }
      throw error;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, request);
  return request as Promise<T>;
}
