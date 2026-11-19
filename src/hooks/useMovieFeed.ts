/**
 * Paginated movie feed for Discover: text search or filtered browsing.
 * Cancels stale requests when inputs change, de-duplicates movies across
 * pages and exposes loading / error / end-of-results state.
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
  meta: Pick<MoviePage, "mode" | "ignoredFilters" | "truncated" | "fuzzy"> | null;
  loadMore: () => void;
  retry: () => void;
}

export function useMovieFeed(query: string, filters: MovieFilters): MovieFeed {
  const [movies, setMovies] = useState<MovieSummary[]>([]);
  const [status, setStatus] = useState<MovieFeed["status"]>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
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

  const fetchPage = useCallback(
    (pageNumber: number, signal: AbortSignal) =>
      searching ? moviesApi.search(trimmed, filters, pageNumber, signal) : moviesApi.discover(filters, pageNumber, signal),
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
    setPage(0);
    fetchPage(1, ac.signal)
      .then((result) => {
        if (ac.signal.aborted) return;
        const fresh = result.results.filter((m) => !seen.current.has(m.id));
        fresh.forEach((m) => seen.current.add(m.id));
        setMovies(fresh);
        setPage(1);
        setTotalPages(result.totalPages);
        setTotalResults(result.totalResults);
        setMeta({ mode: result.mode, ignoredFilters: result.ignoredFilters, truncated: result.truncated, fuzzy: result.fuzzy });
        setStatus("ready");
      })
      .catch((e) => {
        if (ac.signal.aborted || e?.name === "AbortError") return;
        setError(friendlyError(e, "We couldn't load movies."));
        setStatus("error");
      });
    return () => ac.abort();
  }, [fetchPage, attempt]);

  const hasMore = status === "ready" && page < totalPages;

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loadingRef.current || !controller.current) return;
    const signal = controller.current.signal;
    const next = page + 1;
    loadingRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    fetchPage(next, signal)
      .then((result) => {
        if (signal.aborted) return;
        const fresh = result.results.filter((m) => !seen.current.has(m.id));
        fresh.forEach((m) => seen.current.add(m.id));
        setMovies((current) => [...current, ...fresh]);
        setPage(next);
        setTotalPages(result.totalPages);
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
  }, [hasMore, loadingMore, page, fetchPage]);

  const retry = useCallback(() => {
    if (status === "error") setAttempt((n) => n + 1);
    else loadMore();
  }, [status, loadMore]);

  return { movies, status, loadingMore, error, loadMoreError, hasMore, totalResults, meta, loadMore, retry };
}
