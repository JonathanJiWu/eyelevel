/**
 * Paginated movie feed for Discover: text search or filtered browsing.
 * Cancels stale requests when inputs change, de-duplicates movies across
 * pages and exposes loading / error / end-of-results state.
 *
 * Most results are page-numbered. Filtered text search is paged by cursor
 * (MoviePage.nextStart) and a response can hold few or no movies while more
 * remain (the server checks runtime / age rating within a lookup budget), so
 * the feed keeps requesting until it has something new to show.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { moviesApi } from "@/src/lib/api";
import { friendlyError } from "@/src/lib/errors";
import { type MovieFilters } from "@/src/lib/filters";
import { MIN_QUERY_LENGTH } from "@/src/lib/search";
import type { MoviePage, MovieSummary } from "@/src/types/movies";

export interface MovieFeed {
  movies: MovieSummary[];
  status: "loading" | "ready" | "error";
  loadingMore: boolean;
  error: string | null;
  loadMoreError: string | null;
  hasMore: boolean;
  totalResults: number;
  meta: Pick<MoviePage, "mode" | "truncated" | "fuzzy" | "estimatedTotal"> | null;
  loadMore: () => void;
  retry: () => void;
}

/** What to request next: a page number, plus a cursor for filtered search. */
type NextRequest = { page: number; start?: number };

/** Cursor responses requested in a row while they bring nothing new. */
const MAX_EMPTY_FOLLOW_UPS = 12;

function nextAfter(result: MoviePage, request: NextRequest): NextRequest | null {
  if (result.nextStart !== undefined) {
    return result.nextStart === null ? null : { page: request.page + 1, start: result.nextStart };
  }
  return result.page < result.totalPages ? { page: result.page + 1 } : null;
}

export function useMovieFeed(query: string, filters: MovieFilters): MovieFeed {
  const [movies, setMovies] = useState<MovieSummary[]>([]);
  const [status, setStatus] = useState<MovieFeed["status"]>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [next, setNext] = useState<NextRequest | null>(null);
  const [totalResults, setTotalResults] = useState(0);
  const [meta, setMeta] = useState<MovieFeed["meta"]>(null);
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const seen = useRef(new Set<number>());
  // Synchronous guard: several triggers (scroll, end-reached, auto-fill) can
  // fire in the same frame, before the loadingMore state has updated.
  const loadingRef = useRef(false);

  const trimmed = query.trim();
  const searching = trimmed.length >= MIN_QUERY_LENGTH;
  const key = JSON.stringify({ q: searching ? trimmed : "", filters });

  /**
   * Fetch `request` and return the movies not shown yet. Cursor responses
   * that bring nothing new are followed up (each one advances the cursor).
   */
  const fetchFresh = useCallback(
    async (request: NextRequest, signal: AbortSignal) => {
      let current: NextRequest | null = request;
      let result: MoviePage;
      let fresh: MovieSummary[] = [];
      let followUps = 0;
      do {
        result = searching
          ? await moviesApi.search(trimmed, filters, current.page, signal, current.start)
          : await moviesApi.discover(filters, current.page, signal);
        fresh = result.results.filter((m) => !seen.current.has(m.id));
        current = nextAfter(result, current);
      } while (!fresh.length && current?.start !== undefined && ++followUps <= MAX_EMPTY_FOLLOW_UPS && !signal.aborted);
      return { result, fresh, next: current };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    seen.current = new Set();
    setStatus("loading");
    setError(null);
    setLoadMoreError(null);
    setLoadingMore(false);
    loadingRef.current = false;
    setMovies([]);
    setNext(null);
    fetchFresh({ page: 1 }, ac.signal)
      .then(({ result, fresh, next: following }) => {
        if (ac.signal.aborted) return;
        fresh.forEach((m) => seen.current.add(m.id));
        setMovies(fresh);
        setNext(following);
        setTotalResults(result.totalResults);
        setMeta({ mode: result.mode, truncated: result.truncated, fuzzy: result.fuzzy, estimatedTotal: result.estimatedTotal });
        setStatus("ready");
      })
      .catch((e) => {
        if (ac.signal.aborted || e?.name === "AbortError") return;
        setError(friendlyError(e, "We couldn't load movies."));
        setStatus("error");
      });
    return () => ac.abort();
  }, [fetchFresh, attempt]);

  const hasMore = status === "ready" && next !== null;

  const loadMore = useCallback(() => {
    if (!hasMore || !next || loadingMore || loadingRef.current || !controller.current) return;
    const signal = controller.current.signal;
    loadingRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    fetchFresh(next, signal)
      .then(({ result, fresh, next: following }) => {
        if (signal.aborted) return;
        fresh.forEach((m) => seen.current.add(m.id));
        setMovies((current) => [...current, ...fresh]);
        setNext(following);
        // Filtered search estimates get more precise as results are checked.
        setTotalResults(result.totalResults);
        setMeta((current) => (current ? { ...current, estimatedTotal: result.estimatedTotal } : current));
      })
      .catch((e) => {
        if (signal.aborted || e?.name === "AbortError") return;
        setLoadMoreError(friendlyError(e, "We couldn't load more movies."));
      })
      .finally(() => {
        if (signal.aborted) return;
        loadingRef.current = false;
        setLoadingMore(false);
      });
  }, [hasMore, next, loadingMore, fetchFresh]);

  const retry = useCallback(() => {
    if (status === "error") setAttempt((n) => n + 1);
    else loadMore();
  }, [status, loadMore]);

  return { movies, status, loadingMore, error, loadMoreError, hasMore, totalResults, meta, loadMore, retry };
}
