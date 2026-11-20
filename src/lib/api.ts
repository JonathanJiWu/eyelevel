/**
 * Client for the eyelevel API (/api/*). Adds a short-lived response cache,
 * de-duplicates identical in-flight requests, supports cancellation and
 * retries transient failures once.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiBaseUrl } from "@/src/config/env";
import { filtersToParams, type MovieFilters } from "@/src/lib/filters";
import { LruCache } from "@/src/lib/cache";
import type { Genre, Language, MovieDetails, MoviePage } from "@/src/types/movies";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const cache = new LruCache<unknown>(200);
const inflight = new Map<string, Promise<unknown>>();
const CLIENT_TTL = 5 * 60 * 1000;

function resolveBaseUrl(): string {
  if (apiBaseUrl) return apiBaseUrl;
  if (Platform.OS === "web") return "";
  // Native development: talk to the Metro dev server that also serves /api.
  const hostUri = Constants.expoConfig?.hostUri;
  return hostUri ? `http://${hostUri}` : "";
}

function buildUrl(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return `${resolveBaseUrl()}${path}${query ? `?${query}` : ""}`;
}

async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
      const text = await response.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      if (!response.ok) {
        const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
        const apiError = new ApiError(
          response.status,
          err?.code ?? "http_error",
          err?.message ?? `Request failed (${response.status}).`,
        );
        // Retry once on transient upstream problems.
        if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt === 0) {
          lastError = apiError;
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        throw apiError;
      }
      if (body === null) throw new ApiError(502, "invalid_response", "The server returned an invalid response.");
      return body as T;
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw error;
      if (error instanceof ApiError) throw error;
      lastError = error;
      if (attempt === 0 && !signal?.aborted) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
    }
  }
  if (lastError instanceof ApiError) throw lastError;
  throw new ApiError(0, "network_error", "Network error. Check your connection and try again.");
}

export async function apiGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  { signal, ttl = CLIENT_TTL }: { signal?: AbortSignal; ttl?: number } = {},
): Promise<T> {
  const url = buildUrl(path, params);
  const cached = cache.get(url);
  if (cached !== undefined) return cached as T;
  let pending = inflight.get(url) as Promise<T> | undefined;
  if (!pending) {
    // The shared request is not tied to any single caller's AbortSignal.
    pending = request<T>(url).then((data) => {
      cache.set(url, data, ttl);
      return data;
    });
    inflight.set(url, pending);
    pending.finally(() => inflight.delete(url)).catch(() => undefined);
  }
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    pending!.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

export const moviesApi = {
  discover(filters: MovieFilters, page: number, signal?: AbortSignal) {
    return apiGet<MoviePage>("/api/movies/discover", { ...filtersToParams(filters), page }, { signal });
  },
  /** `start` continues filtered results (MoviePage.nextStart). */
  search(query: string, filters: MovieFilters, page: number, signal?: AbortSignal, start?: number) {
    return apiGet<MoviePage>("/api/movies/search", { q: query, ...filtersToParams(filters), page, start }, { signal });
  },
  details(id: number, signal?: AbortSignal) {
    return apiGet<MovieDetails>(`/api/movie/${id}`, {}, { signal, ttl: 30 * 60 * 1000 });
  },
  genres() {
    return apiGet<{ genres: Genre[]; fallback: boolean }>("/api/genres", {}, { ttl: 24 * 60 * 60 * 1000 });
  },
  languages() {
    return apiGet<{ languages: Language[]; fallback: boolean }>("/api/languages", {}, { ttl: 24 * 60 * 60 * 1000 });
  },
};

export function clearApiCache() {
  cache.clear();
}
