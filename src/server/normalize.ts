/**
 * Map raw TMDB payloads into the app's normalized movie types.
 * Every field is defensively validated: TMDB frequently omits values
 * (missing posters, empty release dates, null runtimes, etc.).
 */
import type { CastMember, Genre, Language, MovieDetails, MovieFacts, MovieSummary, Trailer } from "@/src/types/movies";

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const num = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const positiveInt = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
const imagePath = (value: unknown): string | null =>
  typeof value === "string" && /^\/[\w\-.]+\.(jpe?g|png|webp|svg)$/i.test(value) ? value : null;
const round1 = (value: number) => Math.round(value * 10) / 10;

function releaseDate(value: unknown): string | null {
  const date = str(value);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export function toMovieSummary(raw: unknown): MovieSummary | null {
  if (!isObject(raw)) return null;
  if (raw.adult === true) return null;
  const id = positiveInt(raw.id);
  const title = str(raw.title) ?? str(raw.original_title);
  if (!id || !title) return null;
  const date = releaseDate(raw.release_date);
  const genreIds = Array.isArray(raw.genre_ids)
    ? raw.genre_ids.filter((g): g is number => typeof g === "number" && Number.isInteger(g))
    : Array.isArray(raw.genres)
      ? raw.genres.map((g) => (isObject(g) ? positiveInt(g.id) : null)).filter((g): g is number => g !== null)
      : [];
  const originalTitle = str(raw.original_title);
  return {
    id,
    title,
    originalTitle: originalTitle && originalTitle !== title ? originalTitle : null,
    overview: str(raw.overview) ?? "",
    posterPath: imagePath(raw.poster_path),
    backdropPath: imagePath(raw.backdrop_path),
    releaseDate: date,
    year: date ? Number(date.slice(0, 4)) : null,
    genreIds,
    voteAverage: round1(Math.min(10, Math.max(0, num(raw.vote_average)))),
    voteCount: Math.max(0, Math.round(num(raw.vote_count))),
    popularity: Math.max(0, round1(num(raw.popularity))),
    originalLanguage: str(raw.original_language),
  };
}

export function toMovieSummaries(rawList: unknown): MovieSummary[] {
  if (!Array.isArray(rawList)) return [];
  const seen = new Set<number>();
  const out: MovieSummary[] = [];
  for (const raw of rawList) {
    const movie = toMovieSummary(raw);
    if (!movie || seen.has(movie.id)) continue;
    seen.add(movie.id);
    out.push(movie);
  }
  return out;
}

export function toGenres(raw: unknown): Genre[] {
  const list = isObject(raw) && Array.isArray(raw.genres) ? raw.genres : [];
  return list
    .map((g) => (isObject(g) && positiveInt(g.id) && str(g.name) ? { id: g.id as number, name: str(g.name)! } : null))
    .filter((g): g is Genre => g !== null);
}

/** Languages most people filter by, shown first. */
export const POPULAR_LANGUAGE_CODES = [
  "en", "es", "fr", "de", "it", "ja", "ko", "zh", "cn", "hi", "pt", "ru", "sv", "da", "no", "nl", "pl", "tr", "ar", "fa", "th", "id", "ta", "te", "ml", "he",
];

export function toLanguages(raw: unknown): Language[] {
  if (!Array.isArray(raw)) return [];
  const langs = raw
    .map((l) =>
      isObject(l) && typeof l.iso_639_1 === "string" && /^[a-z]{2}$/.test(l.iso_639_1) && l.iso_639_1 !== "xx"
        ? { code: l.iso_639_1, name: str(l.english_name) ?? str(l.name) ?? l.iso_639_1 }
        : null,
    )
    .filter((l): l is Language => l !== null);
  return sortLanguages(langs);
}

export function sortLanguages(langs: Language[]): Language[] {
  const rank = (code: string) => {
    const index = POPULAR_LANGUAGE_CODES.indexOf(code);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...langs].sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name));
}

function names(list: unknown, filter: (item: Raw) => boolean, max: number): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    if (!isObject(item) || !filter(item)) continue;
    const name = str(item.name);
    if (name && !out.includes(name)) out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

function pickTrailer(videos: unknown): Trailer | null {
  const results = isObject(videos) && Array.isArray(videos.results) ? videos.results.filter(isObject) : [];
  const playable = results.filter(
    (v) => (v.site === "YouTube" || v.site === "Vimeo") && typeof v.key === "string" && /^[\w-]{5,32}$/.test(v.key),
  );
  const score = (v: Raw) => (v.type === "Trailer" ? 2 : v.type === "Teaser" ? 1 : 0) + (v.official === true ? 0.5 : 0);
  const best = playable.sort((a, b) => score(b) - score(a))[0];
  if (!best || score(best) < 1) return null;
  return { key: best.key as string, site: best.site as Trailer["site"], name: str(best.name) ?? "Trailer" };
}

function usCertification(releaseDates: unknown): string | null {
  const results = isObject(releaseDates) && Array.isArray(releaseDates.results) ? releaseDates.results : [];
  const us = results.find((r) => isObject(r) && r.iso_3166_1 === "US");
  if (!isObject(us) || !Array.isArray(us.release_dates)) return null;
  const dated = us.release_dates.filter(isObject);
  const preferred = [...dated].sort((a, b) => (a.type === 3 ? -1 : 0) - (b.type === 3 ? -1 : 0));
  for (const entry of preferred) {
    const cert = str(entry.certification);
    if (cert) return cert;
  }
  return null;
}

/** Runtime and US age rating from a /movie/{id}?append_to_response=release_dates payload. */
export function toMovieFacts(raw: unknown): MovieFacts {
  if (!isObject(raw)) return { runtime: null, certification: null };
  return { runtime: positiveInt(raw.runtime), certification: usCertification(raw.release_dates) };
}

export function toMovieDetails(raw: unknown): MovieDetails | null {
  const summary = toMovieSummary(raw);
  if (!summary || !isObject(raw)) return null;
  const credits = isObject(raw.credits) ? raw.credits : {};
  const cast: CastMember[] = (Array.isArray(credits.cast) ? credits.cast : [])
    .filter(isObject)
    .map((c) => ({
      id: positiveInt(c.id) ?? 0,
      name: str(c.name) ?? "",
      character: str(c.character),
      profilePath: imagePath(c.profile_path),
      order: num(c.order, 999),
    }))
    .filter((c) => c.id > 0 && c.name)
    .sort((a, b) => a.order - b.order)
    .slice(0, 12)
    .map(({ order: _order, ...rest }) => rest);
  const genres = (Array.isArray(raw.genres) ? raw.genres : [])
    .map((g) => (isObject(g) && positiveInt(g.id) && str(g.name) ? { id: g.id as number, name: str(g.name)! } : null))
    .filter((g): g is Genre => g !== null);
  const recommendations = toMovieSummaries(isObject(raw.recommendations) ? raw.recommendations.results : []).slice(0, 12);
  const budget = num(raw.budget);
  const revenue = num(raw.revenue);
  const runtime = positiveInt(raw.runtime);
  const imdbId = str(raw.imdb_id);
  const homepage = str(raw.homepage);
  return {
    ...summary,
    genreIds: summary.genreIds.length ? summary.genreIds : genres.map((g) => g.id),
    tagline: str(raw.tagline),
    runtime,
    genres,
    status: str(raw.status),
    budget: budget > 0 ? budget : null,
    revenue: revenue > 0 ? revenue : null,
    homepage: homepage && /^https?:\/\//.test(homepage) ? homepage : null,
    imdbId: imdbId && /^tt\d+$/.test(imdbId) ? imdbId : null,
    spokenLanguages: names(
      Array.isArray(raw.spoken_languages)
        ? raw.spoken_languages.map((l) => (isObject(l) ? { name: l.english_name ?? l.name } : l))
        : [],
      () => true,
      6,
    ),
    productionCountries: names(raw.production_countries, () => true, 6),
    directors: names(credits.crew, (c) => c.job === "Director", 3),
    writers: names(credits.crew, (c) => c.department === "Writing", 3),
    cast,
    trailer: pickTrailer(raw.videos),
    certification: usCertification(raw.release_dates),
    recommendations: recommendations.filter((m) => m.id !== summary.id),
  };
}
