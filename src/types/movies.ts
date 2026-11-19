/**
 * Normalized movie shapes returned by the eyelevel API (/api/*).
 * The server maps raw TMDB payloads into these types so the client never has
 * to deal with missing or inconsistent upstream fields.
 */
export interface MovieSummary {
  id: number;
  title: string;
  originalTitle: string | null;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  year: number | null;
  genreIds: number[];
  voteAverage: number;
  voteCount: number;
  popularity: number;
  originalLanguage: string | null;
}

export interface Genre {
  id: number;
  name: string;
}

export interface Language {
  code: string;
  name: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string | null;
  profilePath: string | null;
}

export interface Trailer {
  key: string;
  site: "YouTube" | "Vimeo";
  name: string;
}

export interface MovieDetails extends MovieSummary {
  tagline: string | null;
  runtime: number | null;
  genres: Genre[];
  status: string | null;
  budget: number | null;
  revenue: number | null;
  homepage: string | null;
  imdbId: string | null;
  spokenLanguages: string[];
  productionCountries: string[];
  directors: string[];
  writers: string[];
  cast: CastMember[];
  trailer: Trailer | null;
  certification: string | null;
  recommendations: MovieSummary[];
}

export interface MoviePage {
  page: number;
  totalPages: number;
  totalResults: number;
  results: MovieSummary[];
  /** "search" when a text query was used, otherwise "discover". */
  mode: "search" | "discover";
  /** Filters that could not be applied in this mode (e.g. runtime during text search). */
  ignoredFilters: string[];
  /** True when results come from a capped window of upstream results. */
  truncated: boolean;
  /** Set when the original query had few matches and spelling-tolerant variants were used. */
  fuzzy: boolean;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
