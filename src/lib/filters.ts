/**
 * Movie filter model shared by the client (UI + URL state) and the server
 * (validation + translation to TMDB query parameters).
 */

export type SortKey = "relevance" | "popularity" | "rating" | "newest" | "oldest" | "title";
export type GenreMode = "any" | "all";
export type RuntimeBucket = "any" | "short" | "medium" | "long";

export interface MovieFilters {
  genres: number[];
  genreMode: GenreMode;
  yearFrom: number | null;
  yearTo: number | null;
  /** Minimum TMDB review score, 0-10. */
  ratingMin: number | null;
  /** Minimum number of TMDB votes (a proxy for popularity / notability). */
  votesMin: number | null;
  /** ISO 639-1 original language code. */
  language: string | null;
  runtime: RuntimeBucket;
  /** US age rating (certification), e.g. "PG-13". */
  certification: string | null;
  sort: SortKey;
}

export const MIN_YEAR = 1874;
export const maxYear = () => new Date().getUTCFullYear() + 5;

/**
 * "relevance" is the default: popularity when browsing, TMDB relevance when
 * searching. Every other key forces that explicit order in both modes.
 */
export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "relevance", label: "Recommended" },
  { key: "popularity", label: "Most popular" },
  { key: "rating", label: "Highest rated" },
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "title", label: "Title A–Z" },
];

export const RUNTIME_OPTIONS: { key: RuntimeBucket; label: string; min?: number; max?: number }[] = [
  { key: "any", label: "Any length" },
  { key: "short", label: "Under 90 min", max: 89 },
  { key: "medium", label: "90–150 min", min: 90, max: 150 },
  { key: "long", label: "Over 150 min", min: 151 },
];

export const CERTIFICATIONS = ["G", "PG", "PG-13", "R", "NC-17"] as const;

export const RATING_OPTIONS = [null, 5, 6, 7, 8] as const;
export const VOTES_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Any" },
  { value: 100, label: "100+ votes" },
  { value: 1000, label: "1k+ votes" },
  { value: 10000, label: "10k+ votes" },
];

export const DEFAULT_FILTERS: MovieFilters = Object.freeze({
  genres: [],
  genreMode: "any",
  yearFrom: null,
  yearTo: null,
  ratingMin: null,
  votesMin: null,
  language: null,
  runtime: "any",
  certification: null,
  sort: "relevance",
}) as MovieFilters;

export function defaultFilters(): MovieFilters {
  return { ...DEFAULT_FILTERS, genres: [] };
}

const SORT_KEYS = new Set<SortKey>(SORT_OPTIONS.map((o) => o.key));
const RUNTIME_KEYS = new Set<RuntimeBucket>(RUNTIME_OPTIONS.map((o) => o.key));

export class FilterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilterValidationError";
  }
}

type ParamSource = { get(name: string): string | null } | Record<string, string | string[] | undefined>;

function read(source: ParamSource, name: string): string | null {
  if (typeof (source as { get?: unknown }).get === "function") {
    const value = (source as { get(name: string): string | null }).get(name);
    return value === null || value === "" ? null : value;
  }
  const raw = (source as Record<string, string | string[] | undefined>)[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === "" ? null : value;
}

function parseIntStrict(value: string, name: string): number {
  if (!/^-?\d+$/.test(value)) throw new FilterValidationError(`"${name}" must be a whole number.`);
  return Number(value);
}

function parseNumber(value: string, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new FilterValidationError(`"${name}" must be a number.`);
  return n;
}

/**
 * Parse filters from URL search params (or expo-router params).
 * strict=true throws on invalid input (server); strict=false silently drops
 * invalid values (client, so a hand-edited URL never breaks the page).
 */
export function parseFilters(source: ParamSource, { strict = false } = {}): MovieFilters {
  const filters = defaultFilters();
  const attempt = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      if (strict) throw error;
    }
  };

  attempt(() => {
    const raw = read(source, "genres");
    if (!raw) return;
    const ids = raw.split(/[,|]/).filter(Boolean).map((part) => parseIntStrict(part, "genres"));
    if (ids.length > 10) throw new FilterValidationError("Select at most 10 genres.");
    if (ids.some((id) => id <= 0)) throw new FilterValidationError('"genres" must be positive ids.');
    filters.genres = Array.from(new Set(ids));
  });
  attempt(() => {
    const raw = read(source, "genreMode");
    if (!raw) return;
    if (raw !== "any" && raw !== "all") throw new FilterValidationError('"genreMode" must be "any" or "all".');
    filters.genreMode = raw;
  });
  attempt(() => {
    const raw = read(source, "yearFrom");
    if (!raw) return;
    const year = parseIntStrict(raw, "yearFrom");
    if (year < MIN_YEAR || year > maxYear()) throw new FilterValidationError(`"yearFrom" must be between ${MIN_YEAR} and ${maxYear()}.`);
    filters.yearFrom = year;
  });
  attempt(() => {
    const raw = read(source, "yearTo");
    if (!raw) return;
    const year = parseIntStrict(raw, "yearTo");
    if (year < MIN_YEAR || year > maxYear()) throw new FilterValidationError(`"yearTo" must be between ${MIN_YEAR} and ${maxYear()}.`);
    filters.yearTo = year;
  });
  attempt(() => {
    if (filters.yearFrom !== null && filters.yearTo !== null && filters.yearFrom > filters.yearTo) {
      throw new FilterValidationError('"yearFrom" cannot be later than "yearTo".');
    }
  });
  if (!strict && filters.yearFrom !== null && filters.yearTo !== null && filters.yearFrom > filters.yearTo) {
    [filters.yearFrom, filters.yearTo] = [filters.yearTo, filters.yearFrom];
  }
  attempt(() => {
    const raw = read(source, "ratingMin");
    if (!raw) return;
    const rating = parseNumber(raw, "ratingMin");
    if (rating < 0 || rating > 10) throw new FilterValidationError('"ratingMin" must be between 0 and 10.');
    filters.ratingMin = rating === 0 ? null : rating;
  });
  attempt(() => {
    const raw = read(source, "votesMin");
    if (!raw) return;
    const votes = parseIntStrict(raw, "votesMin");
    if (votes < 0 || votes > 1_000_000) throw new FilterValidationError('"votesMin" must be between 0 and 1000000.');
    filters.votesMin = votes === 0 ? null : votes;
  });
  attempt(() => {
    const raw = read(source, "language");
    if (!raw) return;
    if (!/^[a-z]{2}$/.test(raw)) throw new FilterValidationError('"language" must be a 2-letter ISO 639-1 code.');
    filters.language = raw;
  });
  attempt(() => {
    const raw = read(source, "runtime");
    if (!raw) return;
    if (!RUNTIME_KEYS.has(raw as RuntimeBucket)) throw new FilterValidationError('"runtime" must be any, short, medium or long.');
    filters.runtime = raw as RuntimeBucket;
  });
  attempt(() => {
    const raw = read(source, "certification");
    if (!raw) return;
    if (!(CERTIFICATIONS as readonly string[]).includes(raw)) {
      throw new FilterValidationError(`"certification" must be one of ${CERTIFICATIONS.join(", ")}.`);
    }
    filters.certification = raw;
  });
  attempt(() => {
    const raw = read(source, "sort");
    if (!raw) return;
    if (!SORT_KEYS.has(raw as SortKey)) throw new FilterValidationError('"sort" is not a supported sort order.');
    filters.sort = raw as SortKey;
  });
  return filters;
}

/** Serialize filters into a flat params object, omitting defaults. */
export function filtersToParams(filters: MovieFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.genres.length) params.genres = [...filters.genres].sort((a, b) => a - b).join(",");
  if (filters.genres.length > 1 && filters.genreMode !== "any") params.genreMode = filters.genreMode;
  if (filters.yearFrom !== null) params.yearFrom = String(filters.yearFrom);
  if (filters.yearTo !== null) params.yearTo = String(filters.yearTo);
  if (filters.ratingMin !== null) params.ratingMin = String(filters.ratingMin);
  if (filters.votesMin !== null) params.votesMin = String(filters.votesMin);
  if (filters.language) params.language = filters.language;
  if (filters.runtime !== "any") params.runtime = filters.runtime;
  if (filters.certification) params.certification = filters.certification;
  if (filters.sort !== DEFAULT_FILTERS.sort) params.sort = filters.sort;
  return params;
}

/** Number of user-set filter criteria (sort excluded). */
export function countActiveFilters(filters: MovieFilters): number {
  let count = 0;
  if (filters.genres.length) count++;
  if (filters.yearFrom !== null || filters.yearTo !== null) count++;
  if (filters.ratingMin !== null) count++;
  if (filters.votesMin !== null) count++;
  if (filters.language) count++;
  if (filters.runtime !== "any") count++;
  if (filters.certification) count++;
  return count;
}

/** True when any filter or a non-default sort is set. */
export function hasActiveCriteria(filters: MovieFilters): boolean {
  return countActiveFilters(filters) > 0 || filters.sort !== "relevance";
}

export function sameFilters(a: MovieFilters, b: MovieFilters): boolean {
  return JSON.stringify(filtersToParams(a)) === JSON.stringify(filtersToParams(b));
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Translate filters into TMDB /discover/movie query parameters.
 * Adds sensible vote-count floors so "highest rated" / "oldest" are not
 * dominated by entries with a single vote.
 */
export function toTmdbDiscoverParams(filters: MovieFilters, page: number): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {
    include_adult: false,
    include_video: false,
    page,
  };
  const sortMap: Record<SortKey, string> = {
    relevance: "popularity.desc",
    popularity: "popularity.desc",
    rating: "vote_average.desc",
    newest: "primary_release_date.desc",
    oldest: "primary_release_date.asc",
    title: "title.asc",
  };
  params.sort_by = sortMap[filters.sort];

  if (filters.genres.length) params.with_genres = filters.genres.join(filters.genreMode === "all" ? "," : "|");
  if (filters.yearFrom !== null) params["primary_release_date.gte"] = `${filters.yearFrom}-01-01`;
  if (filters.yearTo !== null) params["primary_release_date.lte"] = `${filters.yearTo}-12-31`;
  if (filters.sort === "newest") {
    const today = isoToday();
    const lte = params["primary_release_date.lte"] as string | undefined;
    if (!lte || lte > today) params["primary_release_date.lte"] = today;
  }
  if (filters.ratingMin !== null) params["vote_average.gte"] = filters.ratingMin;

  let votesFloor = filters.votesMin ?? 0;
  if (filters.sort === "rating") votesFloor = Math.max(votesFloor, 200);
  if (filters.sort === "oldest" || filters.sort === "title") votesFloor = Math.max(votesFloor, 10);
  if (filters.ratingMin !== null) votesFloor = Math.max(votesFloor, 25);
  if (votesFloor > 0) params["vote_count.gte"] = votesFloor;

  if (filters.language) params.with_original_language = filters.language;
  const runtime = RUNTIME_OPTIONS.find((r) => r.key === filters.runtime);
  if (runtime?.min !== undefined) params["with_runtime.gte"] = runtime.min;
  if (runtime?.max !== undefined) params["with_runtime.lte"] = runtime.max;
  if (filters.certification) {
    params.certification_country = "US";
    params.certification = filters.certification;
  }
  return params;
}

/**
 * TMDB's search endpoint cannot filter or sort, so when a text query is
 * combined with filters or a non-default sort the server scans the top
 * search results and filters/sorts them itself.
 */
export function searchNeedsAggregation(filters: MovieFilters): boolean {
  return (
    filters.genres.length > 0 ||
    filters.yearFrom !== null ||
    filters.yearTo !== null ||
    filters.ratingMin !== null ||
    filters.votesMin !== null ||
    filters.language !== null ||
    needsMovieFacts(filters) ||
    filters.sort !== "relevance"
  );
}

/**
 * Runtime and age rating are not part of TMDB search results: during text
 * search these filters need each candidate's details.
 */
export function needsMovieFacts(filters: MovieFilters): boolean {
  return filters.runtime !== "any" || filters.certification !== null;
}

/** Whether a movie's runtime (minutes) and US age rating pass the filters. Unknown values never match. */
export function matchesMovieFacts(facts: { runtime: number | null; certification: string | null }, filters: MovieFilters): boolean {
  if (filters.runtime !== "any") {
    const range = RUNTIME_OPTIONS.find((r) => r.key === filters.runtime);
    if (facts.runtime === null) return false;
    if (range?.min !== undefined && facts.runtime < range.min) return false;
    if (range?.max !== undefined && facts.runtime > range.max) return false;
  }
  if (filters.certification !== null && facts.certification !== filters.certification) return false;
  return true;
}
