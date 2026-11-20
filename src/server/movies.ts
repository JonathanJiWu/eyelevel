/**
 * Movie data operations used by the API routes.
 */
import { LruCache } from "@/src/lib/cache";
import {
  matchesMovieFacts,
  needsMovieFacts,
  searchNeedsAggregation,
  toTmdbDiscoverParams,
  type MovieFilters,
} from "@/src/lib/filters";
import { dedupeMovies, MIN_QUERY_LENGTH, normalizeQuery, rankByRelevance, SEARCH_SCAN_PAGES, searchVariants } from "@/src/lib/search";
import type { Genre, Language, MovieDetails, MovieFacts, MoviePage, MovieSummary } from "@/src/types/movies";
import { sortLanguages, toGenres, toLanguages, toMovieDetails, toMovieFacts, toMovieSummaries } from "./normalize";
import { tmdbGet, TmdbError, TTL } from "./tmdb";

export const PAGE_SIZE = 20;
/** TMDB never serves pages beyond 500. */
export const MAX_UPSTREAM_PAGE = 500;
export { SEARCH_SCAN_PAGES };
/** Upstream search pages fetched in parallel while scanning. */
const SCAN_BATCH = 5;
/**
 * Runtime and age rating aren't part of search results, so those filters
 * need one details lookup per candidate (cached for a day). Lookups that miss
 * the cache are capped per request; the `nextStart` cursor continues from
 * where a request stopped, so every request makes progress even when it is
 * served by an instance with a cold cache.
 */
export const FACT_LOOKUP_BUDGET = 60;
const FACT_CONCURRENCY = 10;
/** Highest `start` cursor accepted: the scan window plus room for fuzzy extras. */
export const MAX_SEARCH_START = SEARCH_SCAN_PAGES * PAGE_SIZE + 100;

interface RawPage {
  page?: number;
  total_pages?: number;
  total_results?: number;
  results?: unknown;
}

function pageInfo(raw: RawPage) {
  const totalPages = Math.min(MAX_UPSTREAM_PAGE, Math.max(0, Number(raw.total_pages) || 0));
  const totalResults = Math.max(0, Number(raw.total_results) || 0);
  return { totalPages, totalResults };
}

export async function discoverMovies(filters: MovieFilters, page: number): Promise<MoviePage> {
  const raw = await tmdbGet<RawPage>("/discover/movie", toTmdbDiscoverParams(filters, page), TTL.list);
  const { totalPages, totalResults } = pageInfo(raw);
  return {
    page,
    totalPages,
    totalResults,
    results: toMovieSummaries(raw.results),
    mode: "discover",
    truncated: Number(raw.total_pages) > MAX_UPSTREAM_PAGE,
    fuzzy: false,
  };
}

async function searchPage(query: string, page: number): Promise<RawPage> {
  return tmdbGet<RawPage>("/search/movie", { query, page, include_adult: false }, TTL.list);
}

/** Filters that can be checked on search results directly (everything but runtime and age rating). */
function applyFilters(movies: MovieSummary[], filters: MovieFilters): MovieSummary[] {
  return movies.filter((m) => {
    if (filters.genres.length) {
      const matches = filters.genres.filter((g) => m.genreIds.includes(g)).length;
      if (filters.genreMode === "all" ? matches < filters.genres.length : matches === 0) return false;
    }
    if (filters.yearFrom !== null && (m.year === null || m.year < filters.yearFrom)) return false;
    if (filters.yearTo !== null && (m.year === null || m.year > filters.yearTo)) return false;
    if (filters.ratingMin !== null && m.voteAverage < filters.ratingMin) return false;
    if (filters.votesMin !== null && m.voteCount < filters.votesMin) return false;
    if (filters.language && m.originalLanguage !== filters.language) return false;
    return true;
  });
}

function sortMovies(movies: MovieSummary[], sort: MovieFilters["sort"]): MovieSummary[] {
  const byDate = (m: MovieSummary) => m.releaseDate ?? "";
  const sorted = [...movies];
  switch (sort) {
    case "popularity":
      return sorted.sort((a, b) => b.popularity - a.popularity);
    case "rating":
      return sorted.sort((a, b) => b.voteAverage - a.voteAverage || b.voteCount - a.voteCount);
    case "newest":
      return sorted.sort((a, b) => byDate(b).localeCompare(byDate(a)));
    case "oldest":
      return sorted.sort((a, b) => {
        if (!a.releaseDate) return 1;
        if (!b.releaseDate) return -1;
        return byDate(a).localeCompare(byDate(b));
      });
    case "title":
      return sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    default:
      return sorted;
  }
}

/** Movie facts (runtime, US age rating). `null` = TMDB no longer has the movie. */
const factsCache = new LruCache<MovieFacts | null>(20000);

/** Test helper: forget cached movie facts. */
export function __resetMovieCaches() {
  factsCache.clear();
}

/** Runtime and US age rating of one movie, or null if TMDB doesn't have it. Cached for a day. */
export async function getMovieFacts(id: number): Promise<MovieFacts | null> {
  const key = String(id);
  const cached = factsCache.get(key);
  if (cached !== undefined) return cached;
  try {
    // Not stored in the shared response cache: only the two fields are kept.
    const raw = await tmdbGet(`/movie/${id}`, { append_to_response: "release_dates" }, TTL.reference, { cache: false });
    const facts = toMovieFacts(raw);
    factsCache.set(key, facts, TTL.reference);
    return facts;
  } catch (error) {
    if (error instanceof TmdbError && error.status === 404) {
      factsCache.set(key, null, TTL.details);
      return null;
    }
    const stale = factsCache.getStale(key);
    if (stale !== undefined) return stale;
    throw error;
  }
}

/** Facts for each movie in order; `undefined` where the lookup budget ran out first. */
async function lookupFacts(movies: MovieSummary[], budget: { remaining: number }) {
  return Promise.all(
    movies.map((m): Promise<MovieFacts | null | undefined> => {
      const cached = factsCache.get(String(m.id));
      if (cached !== undefined) return Promise.resolve(cached);
      if (budget.remaining <= 0) return Promise.resolve(undefined);
      budget.remaining--;
      return getMovieFacts(m.id);
    }),
  );
}

/**
 * Upstream search results in TMDB relevance order, deduplicated. Pages are
 * fetched on demand, a few in parallel, up to SEARCH_SCAN_PAGES.
 */
async function openSearchScan(query: string) {
  const first = await searchPage(query, 1);
  const { totalPages, totalResults } = pageInfo(first);
  const lastPage = Math.min(SEARCH_SCAN_PAGES, totalPages);
  const movies: MovieSummary[] = [];
  const seen = new Set<number>();
  const add = (list: MovieSummary[]) => {
    for (const m of list) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      movies.push(m);
    }
  };
  let initial = toMovieSummaries(first.results);
  let fuzzy = false;
  if (lastPage <= 1 && initial.length < 5) {
    const expanded = await withVariants(query, initial);
    fuzzy = expanded.length > initial.length;
    initial = expanded;
  }
  add(initial);
  let fetched = 1;
  return {
    movies,
    fuzzy,
    /** More upstream matches exist than the scan window covers. */
    truncated: totalPages > SEARCH_SCAN_PAGES,
    /** Upstream results in the scan window (TMDB's own count). */
    windowSize: Math.min(totalResults, SEARCH_SCAN_PAGES * PAGE_SIZE),
    exhausted: () => fetched >= lastPage,
    /** Fetch the next batch of upstream pages. False when the window is exhausted. */
    async more(): Promise<boolean> {
      if (fetched >= lastPage) return false;
      const from = fetched + 1;
      const to = Math.min(lastPage, fetched + SCAN_BATCH);
      const pages = await Promise.all(Array.from({ length: to - from + 1 }, (_, i) => searchPage(query, from + i)));
      fetched = to;
      for (const raw of pages) add(toMovieSummaries(raw.results));
      return true;
    },
  };
}

/**
 * Text search. Without filters or a custom sort this is a straight
 * pass-through of TMDB pages (with spelling-tolerant variants when the first
 * page has very few hits).
 *
 * With filters or a custom sort, the server scans up to SEARCH_SCAN_PAGES of
 * TMDB matches, keeps those passing the filters (runtime and age rating are
 * checked against each candidate's details), orders them and returns them
 * by cursor: `start` is a position in that ordered candidate list and the
 * response's `nextStart` continues after the last candidate checked.
 */
export async function searchMovies(
  rawQuery: string,
  filters: MovieFilters,
  page: number,
  start: number | null = null,
): Promise<MoviePage> {
  const query = normalizeQuery(rawQuery);
  if (query.length < MIN_QUERY_LENGTH) {
    throw new TmdbError(400, "invalid_query", `Search needs at least ${MIN_QUERY_LENGTH} characters.`);
  }

  if (!searchNeedsAggregation(filters)) {
    const raw = await searchPage(query, page);
    const { totalPages, totalResults } = pageInfo(raw);
    let results = toMovieSummaries(raw.results);
    let fuzzy = false;
    if (page === 1 && results.length < 5) {
      const expanded = await withVariants(query, results);
      if (expanded.length > results.length) {
        fuzzy = expanded.length > results.length;
        results = expanded;
      }
    }
    return {
      page,
      totalPages: fuzzy ? Math.max(1, totalPages) : totalPages,
      totalResults: fuzzy ? Math.max(totalResults, results.length) : totalResults,
      results,
      mode: "search",
      truncated: false,
      fuzzy,
    };
  }
  return filteredSearch(query, filters, page, start ?? (page - 1) * PAGE_SIZE);
}

async function filteredSearch(query: string, filters: MovieFilters, page: number, start: number): Promise<MoviePage> {
  const scan = await openSearchScan(query);
  const relevance = filters.sort === "relevance";
  const withFacts = needsMovieFacts(filters);
  // A custom sort orders the whole scan window, so all of it is needed up
  // front; relevance order is scanned only as far as needed.
  if (!relevance) while (await scan.more());
  const order = () => (relevance ? applyFilters(scan.movies, filters) : sortMovies(applyFilters(scan.movies, filters), filters.sort));

  let candidates = order();
  const results: MovieSummary[] = [];
  const budget = { remaining: FACT_LOOKUP_BUDGET };
  let index = start;
  fill: while (results.length < PAGE_SIZE) {
    if (index >= candidates.length) {
      if (relevance && (await scan.more())) {
        candidates = order();
        continue;
      }
      break;
    }
    if (!withFacts) {
      results.push(candidates[index++]);
      continue;
    }
    const chunk = candidates.slice(index, index + FACT_CONCURRENCY);
    const facts = await lookupFacts(chunk, budget);
    for (let i = 0; i < chunk.length; i++) {
      if (results.length >= PAGE_SIZE) break fill;
      const found = facts[i];
      if (found === undefined) break fill; // lookup budget spent: continue in the next request
      index++;
      if (found && matchesMovieFacts(found, filters)) results.push(chunk[i]);
    }
  }

  const exhausted = index >= candidates.length && scan.exhausted();
  const total = estimateMatches(candidates, scan, filters, withFacts);
  return {
    page,
    totalPages: Math.max(page, Math.ceil(total.count / PAGE_SIZE)),
    totalResults: total.count,
    results,
    mode: "search",
    truncated: scan.truncated,
    fuzzy: scan.fuzzy,
    estimatedTotal: total.estimated,
    nextStart: exhausted ? null : index,
  };
}

/**
 * Number of matches over the whole scan window. Exact once every candidate
 * has been scanned (and, for runtime / age rating, looked up); otherwise
 * extrapolated from what is known so far.
 */
function estimateMatches(
  candidates: MovieSummary[],
  scan: { movies: MovieSummary[]; windowSize: number; exhausted: () => boolean },
  filters: MovieFilters,
  withFacts: boolean,
): { count: number; estimated: boolean } {
  // Candidates expected in the part of the window not fetched yet.
  const unscanned = scan.exhausted()
    ? 0
    : Math.max(0, scan.windowSize - scan.movies.length) * (scan.movies.length ? candidates.length / scan.movies.length : 0);
  if (!withFacts) return { count: Math.round(candidates.length + unscanned), estimated: unscanned > 0 };
  let known = 0;
  let matched = 0;
  for (const m of candidates) {
    const facts = factsCache.get(String(m.id));
    if (facts === undefined) continue;
    known++;
    if (facts && matchesMovieFacts(facts, filters)) matched++;
  }
  const unknown = candidates.length - known + unscanned;
  if (unknown <= 0) return { count: matched, estimated: false };
  const rate = known ? matched / known : 0.5;
  return { count: Math.round(matched + unknown * rate), estimated: true };
}

/** Merge results for spelling-tolerant query variants and re-rank by similarity. */
async function withVariants(query: string, initial: MovieSummary[]): Promise<MovieSummary[]> {
  const variants = searchVariants(query);
  if (!variants.length) return initial;
  const pages = await Promise.all(
    variants.map((variant) =>
      searchPage(variant, 1).catch((error) => {
        if (error instanceof TmdbError && error.status === 404) return { results: [] } as RawPage;
        throw error;
      }),
    ),
  );
  const extra = pages.flatMap((raw) => toMovieSummaries(raw.results));
  const extraIds = new Set(initial.map((m) => m.id));
  const relevantExtra = rankByRelevance(
    query,
    extra.filter((m) => !extraIds.has(m.id)),
    0.45,
  );
  return dedupeMovies([...initial, ...relevantExtra]).slice(0, 40);
}

export async function getMovieDetails(id: number): Promise<MovieDetails> {
  const raw = await tmdbGet(
    `/movie/${id}`,
    { append_to_response: "credits,videos,recommendations,release_dates" },
    TTL.details,
  );
  const details = toMovieDetails(raw);
  if (!details) throw new TmdbError(404, "not_found", "That movie could not be found.");
  return details;
}

export const FALLBACK_GENRES: Genre[] = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Science Fiction" },
  { id: 10770, name: "TV Movie" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" },
];

export const FALLBACK_LANGUAGES: Language[] = sortLanguages([
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Mandarin" },
  { code: "cn", name: "Cantonese" },
  { code: "hi", name: "Hindi" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "no", name: "Norwegian" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "tr", name: "Turkish" },
  { code: "ar", name: "Arabic" },
  { code: "fa", name: "Persian" },
  { code: "th", name: "Thai" },
  { code: "id", name: "Indonesian" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "ml", name: "Malayalam" },
  { code: "he", name: "Hebrew" },
]);

/** Genres with a static fallback so filters keep working if TMDB is down. */
export async function getGenres(): Promise<{ genres: Genre[]; fallback: boolean }> {
  try {
    const genres = toGenres(await tmdbGet("/genre/movie/list", {}, TTL.reference));
    if (genres.length) return { genres, fallback: false };
  } catch (error) {
    console.warn("[movies] genre list unavailable, using fallback:", (error as Error).message);
  }
  return { genres: FALLBACK_GENRES, fallback: true };
}

export async function getLanguages(): Promise<{ languages: Language[]; fallback: boolean }> {
  try {
    const languages = toLanguages(await tmdbGet("/configuration/languages", { language: null }, TTL.reference));
    if (languages.length) return { languages, fallback: false };
  } catch (error) {
    console.warn("[movies] language list unavailable, using fallback:", (error as Error).message);
  }
  return { languages: FALLBACK_LANGUAGES, fallback: true };
}
