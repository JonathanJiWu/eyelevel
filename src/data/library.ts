/**
 * Watchlist + library mutations. Each operation commits ONE atomic batch:
 * the changed documents, an activity log entry, and a recomputed shared
 * index (what friends can see), so the shared view never drifts from the
 * owner's privacy choices.
 */
import {
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  Timestamp,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";
import { computeSharedIndex } from "@/src/lib/sharedIndex";
import { sanitizeMultiline, sanitizeText } from "@/src/lib/validation";
import type { MovieSummary } from "@/src/types/movies";
import { refs } from "./refs";
import {
  LIMITS,
  type ActivityType,
  type LibraryEntry,
  type MovieSnapshot,
  type PrivacySettings,
  type Visibility,
  type Watchlist,
} from "./types";

export interface LibraryState {
  lists: Watchlist[];
  library: LibraryEntry[];
  privacy: PrivacySettings;
}

export class LibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryError";
  }
}

const BATCH_LIMIT = 450;

export function snapshotFromMovie(movie: Pick<MovieSummary, "id" | "title" | "posterPath" | "releaseDate" | "year" | "genreIds" | "voteAverage" | "originalLanguage">): MovieSnapshot {
  return {
    movieId: movie.id,
    title: sanitizeText(movie.title, 300) || "Untitled",
    posterPath: movie.posterPath,
    releaseDate: movie.releaseDate,
    year: movie.year,
    genreIds: movie.genreIds.slice(0, 20),
    voteAverage: Math.round((movie.voteAverage || 0) * 10) / 10,
    originalLanguage: movie.originalLanguage,
  };
}

function writeSharedIndex(batch: WriteBatch, db: Firestore, uid: string, state: LibraryState) {
  batch.set(refs.sharedIndex(db, uid), {
    ...computeSharedIndex(state.lists, state.library, state.privacy),
    updatedAt: serverTimestamp(),
  });
}

function logActivity(
  batch: WriteBatch,
  db: Firestore,
  uid: string,
  type: ActivityType,
  extra: { movieId?: number; title?: string; listId?: string; listName?: string; rating?: number | null } = {},
) {
  batch.set(doc(refs.activity(db, uid)), {
    type,
    movieId: extra.movieId ?? null,
    title: extra.title ?? null,
    listId: extra.listId ?? null,
    listName: extra.listName ?? null,
    rating: extra.rating ?? null,
    createdAt: serverTimestamp(),
  });
}

function entryData(entry: LibraryEntry) {
  return {
    movieId: entry.movieId,
    title: entry.title,
    posterPath: entry.posterPath,
    releaseDate: entry.releaseDate,
    year: entry.year,
    genreIds: entry.genreIds,
    voteAverage: entry.voteAverage,
    originalLanguage: entry.originalLanguage,
    listIds: entry.listIds,
    watched: entry.watched,
    watchedAt: entry.watchedAt,
    rating: entry.rating,
    ratedAt: entry.ratedAt,
    addedAt: entry.addedAt ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

const keepEntry = (e: Pick<LibraryEntry, "listIds" | "watched" | "rating">) => e.listIds.length > 0 || e.watched || e.rating !== null;

function replaceEntry(library: LibraryEntry[], next: LibraryEntry | null, movieId: number): LibraryEntry[] {
  const rest = library.filter((e) => e.movieId !== movieId);
  return next && keepEntry(next) ? [...rest, next] : rest;
}

function newEntry(movie: MovieSnapshot): LibraryEntry {
  return { ...movie, listIds: [], watched: false, watchedAt: null, rating: null, ratedAt: null, addedAt: null, updatedAt: null };
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export interface ListInput {
  name: string;
  description?: string;
  visibility: Visibility;
}

function cleanListInput(input: ListInput) {
  const name = sanitizeText(input.name, LIMITS.listName);
  if (!name) throw new LibraryError("Give your list a name.");
  return {
    name,
    description: sanitizeMultiline(input.description ?? "", LIMITS.listDescription),
    visibility: input.visibility === "friends" ? "friends" : "private",
  } as const;
}

/**
 * Create a list. Optionally add a movie to it in the same atomic batch
 * (`addMovie.listIds` = the movie's other lists to keep), so a brand-new
 * list can be used immediately without waiting for listeners to update.
 */
export async function createList(
  db: Firestore,
  uid: string,
  state: LibraryState,
  input: ListInput,
  addMovie?: { movie: MovieSnapshot; listIds: string[] },
): Promise<string> {
  if (state.lists.length >= LIMITS.listsPerUser) throw new LibraryError(`You can have up to ${LIMITS.listsPerUser} lists.`);
  const clean = cleanListInput(input);
  if (state.lists.some((l) => l.name.toLowerCase() === clean.name.toLowerCase())) {
    throw new LibraryError("You already have a list with that name.");
  }
  const ref = doc(refs.watchlists(db, uid));
  const now = Timestamp.now();
  const list: Watchlist = { id: ref.id, ...clean, createdAt: now, updatedAt: now };
  const lists = [...state.lists, list];
  let library = state.library;
  const batch = writeBatch(db);
  batch.set(ref, { ...clean, createdAt: now, updatedAt: now });
  logActivity(batch, db, uid, "list_created", { listId: ref.id, listName: clean.name });
  let finalLists = lists;
  if (addMovie) {
    const known = new Set(state.lists.map((l) => l.id));
    const { movie } = addMovie;
    const current = state.library.find((e) => e.movieId === movie.movieId) ?? newEntry(movie);
    const kept = Array.from(new Set(addMovie.listIds.filter((id) => known.has(id))));
    const before = current.listIds.filter((id) => known.has(id));
    const added = kept.filter((id) => !before.includes(id));
    const removed = before.filter((id) => !kept.includes(id));
    const next: LibraryEntry = { ...current, ...movie, listIds: [...kept, ref.id].slice(0, LIMITS.listIdsPerMovie) };
    library = replaceEntry(state.library, next, movie.movieId);
    batch.set(refs.libraryEntry(db, uid, movie.movieId), entryData(next));
    // Keep other lists consistent with setMovieLists: bump updatedAt and log changes.
    finalLists = lists.map((l) => (added.includes(l.id) || removed.includes(l.id) ? { ...l, updatedAt: now } : l));
    for (const id of [...added, ...removed]) batch.update(refs.watchlist(db, uid, id), { updatedAt: now });
    const name = (id: string) => state.lists.find((l) => l.id === id)?.name ?? "";
    logActivity(batch, db, uid, "added", { movieId: movie.movieId, title: movie.title, listId: ref.id, listName: clean.name });
    for (const id of added) logActivity(batch, db, uid, "added", { movieId: movie.movieId, title: movie.title, listId: id, listName: name(id) });
    for (const id of removed) logActivity(batch, db, uid, "removed", { movieId: movie.movieId, title: movie.title, listId: id, listName: name(id) });
  }
  writeSharedIndex(batch, db, uid, { ...state, lists: finalLists, library });
  await batch.commit();
  return ref.id;
}

export async function updateList(db: Firestore, uid: string, state: LibraryState, listId: string, input: ListInput) {
  const current = state.lists.find((l) => l.id === listId);
  if (!current) throw new LibraryError("That list no longer exists.");
  const clean = cleanListInput(input);
  if (state.lists.some((l) => l.id !== listId && l.name.toLowerCase() === clean.name.toLowerCase())) {
    throw new LibraryError("You already have a list with that name.");
  }
  const now = Timestamp.now();
  const updated: Watchlist = { ...current, ...clean, updatedAt: now };
  const batch = writeBatch(db);
  batch.update(refs.watchlist(db, uid, listId), { ...clean, updatedAt: now });
  writeSharedIndex(batch, db, uid, { ...state, lists: state.lists.map((l) => (l.id === listId ? updated : l)) });
  logActivity(batch, db, uid, "list_updated", { listId, listName: clean.name });
  await batch.commit();
}

/** Deletes a list. Movies stay in your other lists; ratings/watched status are kept. */
export async function deleteList(db: Firestore, uid: string, state: LibraryState, listId: string) {
  const list = state.lists.find((l) => l.id === listId);
  if (!list) throw new LibraryError("That list no longer exists.");
  const affected = state.library.filter((e) => e.listIds.includes(listId));
  let library = state.library;
  const lists = state.lists.filter((l) => l.id !== listId);

  // Large lists are processed in chunks; the list doc itself is removed in the final batch.
  for (let i = 0; i < affected.length; i += BATCH_LIMIT) {
    const chunk = affected.slice(i, i + BATCH_LIMIT);
    const last = i + BATCH_LIMIT >= affected.length;
    const batch = writeBatch(db);
    for (const entry of chunk) {
      const next = { ...entry, listIds: entry.listIds.filter((id) => id !== listId) };
      library = replaceEntry(library, next, entry.movieId);
      if (keepEntry(next)) batch.set(refs.libraryEntry(db, uid, entry.movieId), entryData(next));
      else batch.delete(refs.libraryEntry(db, uid, entry.movieId));
    }
    if (last) {
      batch.delete(refs.watchlist(db, uid, listId));
      logActivity(batch, db, uid, "list_deleted", { listId, listName: list.name });
    }
    writeSharedIndex(batch, db, uid, { ...state, lists: last ? lists : state.lists, library });
    await batch.commit();
  }
  if (affected.length === 0) {
    const batch = writeBatch(db);
    batch.delete(refs.watchlist(db, uid, listId));
    logActivity(batch, db, uid, "list_deleted", { listId, listName: list.name });
    writeSharedIndex(batch, db, uid, { ...state, lists, library });
    await batch.commit();
  }
}

// ---------------------------------------------------------------------------
// Movies
// ---------------------------------------------------------------------------

/** Set exactly which of the user's lists contain a movie. */
export async function setMovieLists(db: Firestore, uid: string, state: LibraryState, movie: MovieSnapshot, listIds: string[]) {
  const known = new Set(state.lists.map((l) => l.id));
  const target = Array.from(new Set(listIds.filter((id) => known.has(id)))).slice(0, LIMITS.listIdsPerMovie);
  const current = state.library.find((e) => e.movieId === movie.movieId) ?? newEntry(movie);
  const before = new Set(current.listIds.filter((id) => known.has(id)));
  const added = target.filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !target.includes(id));
  if (!added.length && !removed.length) return;

  const next: LibraryEntry = { ...current, ...movie, listIds: target };
  const now = Timestamp.now();
  const lists = state.lists.map((l) => (added.includes(l.id) || removed.includes(l.id) ? { ...l, updatedAt: now } : l));
  const library = replaceEntry(state.library, next, movie.movieId);

  const batch = writeBatch(db);
  if (keepEntry(next)) batch.set(refs.libraryEntry(db, uid, movie.movieId), entryData(next));
  else batch.delete(refs.libraryEntry(db, uid, movie.movieId));
  for (const id of [...added, ...removed]) batch.update(refs.watchlist(db, uid, id), { updatedAt: now });
  writeSharedIndex(batch, db, uid, { ...state, lists, library });
  const name = (id: string) => state.lists.find((l) => l.id === id)?.name ?? "";
  for (const id of added) logActivity(batch, db, uid, "added", { movieId: movie.movieId, title: movie.title, listId: id, listName: name(id) });
  for (const id of removed) logActivity(batch, db, uid, "removed", { movieId: movie.movieId, title: movie.title, listId: id, listName: name(id) });
  await batch.commit();
}

export async function setWatched(db: Firestore, uid: string, state: LibraryState, movie: MovieSnapshot, watched: boolean) {
  const current = state.library.find((e) => e.movieId === movie.movieId) ?? newEntry(movie);
  if (current.watched === watched) return;
  const next: LibraryEntry = { ...current, ...movie, listIds: current.listIds, watched, watchedAt: watched ? Timestamp.now() : null };
  const batch = writeBatch(db);
  if (keepEntry(next)) batch.set(refs.libraryEntry(db, uid, movie.movieId), entryData(next));
  else batch.delete(refs.libraryEntry(db, uid, movie.movieId));
  writeSharedIndex(batch, db, uid, { ...state, library: replaceEntry(state.library, next, movie.movieId) });
  logActivity(batch, db, uid, watched ? "watched" : "unwatched", { movieId: movie.movieId, title: movie.title });
  await batch.commit();
}

export async function setRating(db: Firestore, uid: string, state: LibraryState, movie: MovieSnapshot, rating: number | null) {
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new LibraryError("Ratings are 1 to 5 stars.");
  }
  const current = state.library.find((e) => e.movieId === movie.movieId) ?? newEntry(movie);
  if (current.rating === rating) return;
  const next: LibraryEntry = { ...current, ...movie, listIds: current.listIds, rating, ratedAt: rating ? Timestamp.now() : null };
  const batch = writeBatch(db);
  if (keepEntry(next)) batch.set(refs.libraryEntry(db, uid, movie.movieId), entryData(next));
  else batch.delete(refs.libraryEntry(db, uid, movie.movieId));
  writeSharedIndex(batch, db, uid, { ...state, library: replaceEntry(state.library, next, movie.movieId) });
  logActivity(batch, db, uid, rating ? "rated" : "unrated", { movieId: movie.movieId, title: movie.title, rating });
  await batch.commit();
}

/** Re-derive the shared index from current state (self-healing after concurrent edits). */
export async function syncSharedIndex(db: Firestore, uid: string, state: LibraryState) {
  const batch = writeBatch(db);
  writeSharedIndex(batch, db, uid, state);
  await batch.commit();
}

/** Remove all activity entries (privacy convenience). */
export async function clearActivity(db: Firestore, uid: string) {
  const snap = await getDocs(refs.activity(db, uid));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}
