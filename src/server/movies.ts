/**
 * Movie data operations used by the API routes.
 */
import {
  activeBrowseOnlyFilters,
  searchNeedsAggregation,
  toTmdbDiscoverParams,
  type MovieFilters,
} from "@/src/lib/filters";
import { dedupeMovies, MIN_QUERY_LENGTH, normalizeQuery, rankByRelevance, searchVariants } from "@/src/lib/search";
import type { Genre, Language, MovieDetails, MoviePage, MovieSummary } from "@/src/types/movies";
import { sortLanguages, toGenres, toLanguages, toMovieDetails, toMovieSummaries } from "./normalize";
import { tmdbGet, TmdbError, TTL } from "./tmdb";

export const PAGE_SIZE = 20;
/** TMDB never serves pages beyond 500. */
export const MAX_UPSTREAM_PAGE = 500;
/** Upstream search pages aggregated when a query is combined with filters. */
export const AGGREGATE_PAGES = 5;

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
    ignoredFilters: [],
    truncated: Number(raw.total_pages) > MAX_UPSTREAM_PAGE,
    fuzzy: false,
  };
}

async function searchPage(query: string, page: number): Promise<RawPage> {
  return tmdbGet<RawPage>("/search/movie", { query, page, include_adult: false }, TTL.list);
}

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

/**
 * Text search. Without filters this is a straight pass-through of TMDB pages.
 * With filters or a custom sort, the top AGGREGATE_PAGES upstream pages are
 * fetched (cached), filtered and sorted server-side, then re-paginated.
 * If the first page has very few hits, spelling-tolerant variants are tried.
 */
export async function searchMovies(rawQuery: string, filters: MovieFilters, page: number): Promise<MoviePage> {
  const query = normalizeQuery(rawQuery);
  if (query.length < MIN_QUERY_LENGTH) {
    throw new TmdbError(400, "invalid_query", `Search needs at least ${MIN_QUERY_LENGTH} characters.`);
  }
  const ignoredFilters = activeBrowseOnlyFilters(filters);

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
      ignoredFilters,
      truncated: false,
      fuzzy,
    };
  }

  const first = await searchPage(query, 1);
  const upstreamPages = Math.min(AGGREGATE_PAGES, pageInfo(first).totalPages);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, upstreamPages - 1) }, (_, i) => searchPage(query, i + 2)),
  );
  let candidates = dedupeMovies([first, ...rest].flatMap((raw) => toMovieSummaries(raw.results)));
  let fuzzy = false;
  if (candidates.length < 5) {
    const expanded = await withVariants(query, candidates);
    fuzzy = expanded.length > candidates.length;
    candidates = expanded;
  }
  const filtered = applyFilters(candidates, filters);
  const ordered = filters.sort === "relevance" ? filtered : sortMovies(filtered, filters.sort);
  const totalPages = Math.ceil(ordered.length / PAGE_SIZE);
  const start = (page - 1) * PAGE_SIZE;
  return {
    page,
    totalPages,
    totalResults: ordered.length,
    results: ordered.slice(start, start + PAGE_SIZE),
    mode: "search",
    ignoredFilters,
    truncated: pageInfo(first).totalPages > AGGREGATE_PAGES,
    fuzzy,
  };
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
