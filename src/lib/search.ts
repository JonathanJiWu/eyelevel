/**
 * Search helpers: query normalization, spelling-tolerant query variants and
 * similarity-based ranking. Pure functions shared by server and tests.
 */
import type { MovieSummary } from "@/src/types/movies";

export const MAX_QUERY_LENGTH = 100;
export const MIN_QUERY_LENGTH = 2;
/**
 * TMDB search can't filter or sort, so when a query is combined with filters
 * or a custom sort the server does it over the top SEARCH_SCAN_PAGES pages
 * of matches (TMDB serves 20 per page).
 */
export const SEARCH_SCAN_PAGES = 25;
export const SEARCH_SCAN_RESULTS = SEARCH_SCAN_PAGES * 20;

/** Trim, collapse whitespace, normalize unicode and cap length. */
export function normalizeQuery(input: string): string {
  return input.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

/** Lowercase, strip accents and punctuation for comparisons. */
export function foldText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ROMAN: Record<string, string> = { ii: "2", iii: "3", iv: "4", v: "5", vi: "6" };
const DIGITS: Record<string, string> = Object.fromEntries(Object.entries(ROMAN).map(([k, v]) => [v, k]));

/**
 * Alternative queries to try when the original returns few results.
 * TMDB matches word prefixes, so truncating a long (possibly misspelled) word
 * recovers many typos: "interstelar" -> "interst" -> "Interstellar".
 */
export function searchVariants(query: string, max = 3): string[] {
  const folded = foldText(query);
  const original = normalizeQuery(query).toLowerCase();
  const variants: string[] = [];
  const add = (value: string) => {
    const v = value.replace(/\s+/g, " ").trim();
    if (v.length >= MIN_QUERY_LENGTH && v !== original && !variants.includes(v)) variants.push(v);
  };
  if (!folded) return [];
  const words = folded.split(" ");

  // Punctuation/diacritics-free form ("spider-man" -> "spider man").
  add(folded);
  // Joined form for split compound words ("spider man" -> "spiderman").
  if (words.length === 2 && words.every((w) => w.length >= 3)) add(words.join(""));
  // Sequel numbering: "rocky 2" <-> "rocky ii".
  const swapped = words.map((w) => ROMAN[w] ?? DIGITS[w] ?? w).join(" ");
  if (swapped !== folded) add(swapped);
  // Drop a leading article.
  if (words.length > 1 && ["the", "a", "an"].includes(words[0])) add(words.slice(1).join(" "));
  // Truncate the longest word to tolerate typos in its tail.
  const longest = words.reduce((best, w, i) => (w.length > words[best].length ? i : best), 0);
  if (words[longest].length >= 5) {
    const cut = Math.max(3, Math.ceil(words[longest].length * 0.6));
    const truncated = [...words];
    truncated[longest] = words[longest].slice(0, cut);
    add(truncated.slice(0, longest + 1).join(" "));
  }
  // Drop the last (possibly half-typed or misspelled) word.
  if (words.length > 2) add(words.slice(0, -1).join(" "));
  return variants.slice(0, max);
}

function bigrams(text: string): Map<string, number> {
  const grams = new Map<string, number>();
  const padded = ` ${text} `;
  for (let i = 0; i < padded.length - 1; i++) {
    const gram = padded.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

/** Sørensen–Dice coefficient over character bigrams (0..1). */
export function diceSimilarity(a: string, b: string): number {
  const x = foldText(a);
  const y = foldText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ga = bigrams(x);
  const gb = bigrams(y);
  let overlap = 0;
  let total = 0;
  for (const count of ga.values()) total += count;
  for (const count of gb.values()) total += count;
  for (const [gram, count] of ga) overlap += Math.min(count, gb.get(gram) ?? 0);
  return (2 * overlap) / total;
}

/**
 * How well a title matches the query. Rewards exact/prefix/word matches and
 * tolerates typos via bigram similarity (also against the title's prefix, so
 * partial queries like "godfath" score well against "The Godfather").
 */
export function titleMatchScore(query: string, title: string): number {
  const q = foldText(query);
  const t = foldText(title);
  if (!q || !t) return 0;
  if (q === t) return 1;
  const tNoArticle = t.replace(/^(the|a|an) /, "");
  if (t.startsWith(q) || tNoArticle.startsWith(q)) return 0.95;
  const words = t.split(" ");
  if (words.some((w) => w.startsWith(q))) return 0.85;
  if (t.includes(q)) return 0.8;
  const prefix = t.slice(0, Math.max(q.length, 1) + 1);
  return Math.max(diceSimilarity(q, t), diceSimilarity(q, prefix) * 0.95, diceSimilarity(q, tNoArticle));
}

export function movieMatchScore(query: string, movie: Pick<MovieSummary, "title" | "originalTitle">): number {
  return Math.max(
    titleMatchScore(query, movie.title),
    movie.originalTitle ? titleMatchScore(query, movie.originalTitle) * 0.98 : 0,
  );
}

/** Remove duplicate movies (by id), keeping the first occurrence. */
export function dedupeMovies<T extends { id: number }>(movies: T[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const movie of movies) {
    if (seen.has(movie.id)) continue;
    seen.add(movie.id);
    out.push(movie);
  }
  return out;
}

/**
 * Rank candidates by title similarity blended with popularity and the
 * upstream position. Candidates below `minScore` similarity are dropped.
 */
export function rankByRelevance(query: string, movies: MovieSummary[], minScore = 0): MovieSummary[] {
  const maxPopularity = Math.max(1, ...movies.map((m) => m.popularity || 0));
  return movies
    .map((movie, index) => {
      const match = movieMatchScore(query, movie);
      const popularity = Math.log1p(movie.popularity || 0) / Math.log1p(maxPopularity);
      const position = 1 - index / Math.max(movies.length, 1);
      return { movie, match, score: match * 0.65 + popularity * 0.25 + position * 0.1 };
    })
    .filter((entry) => entry.match >= minScore)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.movie);
}
