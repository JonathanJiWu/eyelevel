/**
 * Watchlist cross-referencing between the current user and friends.
 * Works only on data each participant has chosen to share.
 */
import type { LibraryEntry, SharedIndexData } from "@/src/data/types";

export interface ParticipantMovie {
  title: string;
  posterPath: string | null;
  year: number | null;
  genreIds: number[];
  /** In at least one (visible) watchlist — i.e. wants to watch. */
  saved: boolean;
  watched: boolean;
  rating: number | null;
}

export interface Participant {
  uid: string;
  name: string;
  movies: Map<number, ParticipantMovie>;
}

export interface OverlapMovie {
  movieId: number;
  title: string;
  posterPath: string | null;
  year: number | null;
  savedBy: string[];
  watchedBy: string[];
  ratings: Record<string, number>;
}

export function participantFromLibrary(uid: string, name: string, library: LibraryEntry[]): Participant {
  const movies = new Map<number, ParticipantMovie>();
  for (const entry of library) {
    movies.set(entry.movieId, {
      title: entry.title,
      posterPath: entry.posterPath,
      year: entry.year,
      genreIds: entry.genreIds,
      saved: entry.listIds.length > 0,
      watched: entry.watched,
      rating: entry.rating,
    });
  }
  return { uid, name, movies };
}

export function participantFromSharedIndex(uid: string, name: string, index: SharedIndexData | null): Participant {
  const movies = new Map<number, ParticipantMovie>();
  for (const [id, movie] of Object.entries(index?.movies ?? {})) {
    const movieId = Number(id);
    if (!Number.isInteger(movieId)) continue;
    movies.set(movieId, {
      title: movie.t,
      posterPath: movie.p,
      year: movie.y,
      genreIds: movie.g ?? [],
      saved: (movie.l ?? []).length > 0,
      watched: movie.w === true,
      rating: typeof movie.r === "number" ? movie.r : null,
    });
  }
  return { uid, name, movies };
}

/** Every movie touched by any participant, with who saved / watched / rated it. */
export function computeOverlap(participants: Participant[]): OverlapMovie[] {
  const byMovie = new Map<number, OverlapMovie>();
  for (const participant of participants) {
    for (const [movieId, movie] of participant.movies) {
      let entry = byMovie.get(movieId);
      if (!entry) {
        entry = { movieId, title: movie.title, posterPath: movie.posterPath, year: movie.year, savedBy: [], watchedBy: [], ratings: {} };
        byMovie.set(movieId, entry);
      }
      if (!entry.posterPath && movie.posterPath) entry.posterPath = movie.posterPath;
      if (movie.saved) entry.savedBy.push(participant.uid);
      if (movie.watched) entry.watchedBy.push(participant.uid);
      if (movie.rating) entry.ratings[participant.uid] = movie.rating;
    }
  }
  return [...byMovie.values()].sort(
    (a, b) => b.savedBy.length - a.savedBy.length || b.watchedBy.length - a.watchedBy.length || a.title.localeCompare(b.title),
  );
}

export interface ComparisonResult {
  /** Saved by every participant. */
  everyone: OverlapMovie[];
  /** Saved by at least two participants (but not everyone). */
  some: OverlapMovie[];
  /** Saved by only the first participant (the current user). */
  onlyMine: OverlapMovie[];
  /** Saved by others but not the current user. */
  onlyTheirs: OverlapMovie[];
  /** Watched by at least two participants. */
  watchedTogether: OverlapMovie[];
  /** Rated by the current user and at least one other participant. */
  ratedByBoth: OverlapMovie[];
  /** 0–100: overlap of saved movies (Jaccard index) between all participants. */
  matchScore: number;
}

export function compareParticipants(participants: Participant[]): ComparisonResult {
  const [me] = participants;
  const overlap = computeOverlap(participants);
  const n = participants.length;
  const saved = overlap.filter((m) => m.savedBy.length > 0);
  const everyone = saved.filter((m) => m.savedBy.length === n);
  const some = saved.filter((m) => m.savedBy.length >= 2 && m.savedBy.length < n);
  const onlyMine = me ? saved.filter((m) => m.savedBy.length === 1 && m.savedBy[0] === me.uid) : [];
  const onlyTheirs = me ? saved.filter((m) => !m.savedBy.includes(me.uid)) : saved;
  const watchedTogether = overlap.filter((m) => m.watchedBy.length >= 2);
  const ratedByBoth = me
    ? overlap.filter((m) => m.ratings[me.uid] !== undefined && Object.keys(m.ratings).length >= 2)
    : [];
  const matchScore = n < 2 || saved.length === 0 ? 0 : Math.round((everyone.length / saved.length) * 100);
  return { everyone, some, onlyMine, onlyTheirs, watchedTogether, ratedByBoth, matchScore };
}

/** Movies that at least `min` friends saved, most-saved first. */
export function popularAmongFriends(friends: Participant[], min = 2, exclude: Set<number> = new Set()): OverlapMovie[] {
  return computeOverlap(friends).filter((m) => m.savedBy.length >= min && !exclude.has(m.movieId));
}

/** Count of movies both participants saved. */
export function sharedSavedCount(a: Participant, b: Participant): number {
  let count = 0;
  for (const [movieId, movie] of a.movies) {
    if (movie.saved && b.movies.get(movieId)?.saved) count++;
  }
  return count;
}
