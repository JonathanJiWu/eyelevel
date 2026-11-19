/**
 * Builds the friends-visible "shared index" from a user's private data.
 *
 * This is the single place that decides what friends can see:
 *  - movies in lists marked "friends" (private lists are never included),
 *  - watched status only if privacy.shareWatched,
 *  - ratings only if privacy.shareRatings.
 */
import type {
  LibraryEntry,
  PrivacySettings,
  SharedIndexData,
  SharedList,
  SharedMovie,
  Watchlist,
} from "@/src/data/types";
import { LIMITS } from "@/src/data/types";

const millis = (value: { toMillis(): number } | null | undefined) => (value ? value.toMillis() : 0);

export function computeSharedIndex(
  lists: Pick<Watchlist, "id" | "name" | "description" | "visibility" | "updatedAt">[],
  library: Pick<LibraryEntry, "movieId" | "title" | "posterPath" | "year" | "genreIds" | "listIds" | "watched" | "rating">[],
  privacy: PrivacySettings,
): SharedIndexData {
  const visible = new Map(lists.filter((l) => l.visibility === "friends").map((l) => [l.id, l]));
  const counts = new Map<string, number>();
  const movies: Record<string, SharedMovie> = {};

  const sortedLibrary = [...library].sort((a, b) => a.movieId - b.movieId);
  for (const entry of sortedLibrary) {
    const listIds = entry.listIds.filter((id) => visible.has(id)).sort();
    for (const id of listIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    const watched = privacy.shareWatched && entry.watched;
    const rating = privacy.shareRatings && entry.rating ? entry.rating : null;
    if (!listIds.length && !watched && !rating) continue;
    if (Object.keys(movies).length >= LIMITS.sharedMovies) break;
    const shared: SharedMovie = {
      t: entry.title,
      p: entry.posterPath,
      y: entry.year,
      g: entry.genreIds.slice(0, 3),
      l: listIds,
    };
    if (watched) shared.w = true;
    if (rating) shared.r = rating;
    movies[String(entry.movieId)] = shared;
  }

  const sharedLists: Record<string, SharedList> = {};
  for (const [id, list] of [...visible.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    sharedLists[id] = { n: list.name, d: list.description, c: counts.get(id) ?? 0, u: millis(list.updatedAt) };
  }
  return { version: 1, movies, lists: sharedLists };
}

/** Deterministic serialization for change detection (keys sorted recursively). */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function sameSharedIndex(a: SharedIndexData | null | undefined, b: SharedIndexData | null | undefined): boolean {
  if (!a || !b) return a === b;
  return stableStringify({ movies: a.movies, lists: a.lists }) === stableStringify({ movies: b.movies, lists: b.lists });
}
