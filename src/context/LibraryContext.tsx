/**
 * The signed-in user's watchlists and library, kept live with Firestore
 * listeners (writes show up instantly via latency compensation and persist
 * across refreshes, devices and sessions).
 */
import { onSnapshot, Timestamp } from "firebase/firestore";
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  createList as createListOp,
  deleteList as deleteListOp,
  LibraryError,
  setMovieLists as setMovieListsOp,
  setRating as setRatingOp,
  setWatched as setWatchedOp,
  syncSharedIndex,
  updateList as updateListOp,
  type LibraryState,
  type ListInput,
} from "@/src/data/library";
import { refs, toLibraryEntry, toSharedIndex, toWatchlist } from "@/src/data/refs";
import { DEFAULT_PRIVACY, type LibraryEntry, type MovieSnapshot, type SharedIndex, type Watchlist } from "@/src/data/types";
import { friendlyError } from "@/src/lib/errors";
import { getFirebase } from "@/src/lib/firebase";
import { computeSharedIndex, sameSharedIndex } from "@/src/lib/sharedIndex";
import { useAuth } from "./AuthContext";

export interface ListSummary extends Watchlist {
  count: number;
  posters: (string | null)[];
}

interface LibraryValue {
  ready: boolean;
  error: string | null;
  lists: ListSummary[];
  library: LibraryEntry[];
  entryFor: (movieId: number) => LibraryEntry | undefined;
  isSaved: (movieId: number) => boolean;
  defaultList: ListSummary | null;
  /** Create a list; optionally add `movie` to it atomically (keeping `keepListIds`). */
  createList: (input: ListInput, addMovie?: { movie: MovieSnapshot; keepListIds: string[] }) => Promise<string>;
  updateList: (listId: string, input: ListInput) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
  setMovieLists: (movie: MovieSnapshot, listIds: string[]) => Promise<void>;
  /** Add to the default list (creating "Watchlist" if the user has none). */
  quickAdd: (movie: MovieSnapshot) => Promise<ListSummary>;
  removeFromList: (movie: MovieSnapshot, listId: string) => Promise<void>;
  setWatched: (movie: MovieSnapshot, watched: boolean) => Promise<void>;
  setRating: (movie: MovieSnapshot, rating: number | null) => Promise<void>;
}

const LibraryContext = createContext<LibraryValue | null>(null);

const millis = (value: { toMillis(): number } | null | undefined) => (value ? value.toMillis() : Number.MAX_SAFE_INTEGER);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const { user, userDoc, accountReady } = useAuth();
  const [lists, setLists] = useState<Watchlist[]>([]);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [storedIndex, setStoredIndex] = useState<SharedIndex | null>(null);
  const [loaded, setLoaded] = useState({ lists: false, library: false, index: false });
  const [pendingWrites, setPendingWrites] = useState({ lists: false, library: false, index: false });
  const [error, setError] = useState<string | null>(null);
  const uid = user?.uid ?? null;
  const privacy = userDoc?.privacy ?? DEFAULT_PRIVACY;

  useEffect(() => {
    setLists([]);
    setLibrary([]);
    setStoredIndex(null);
    setLoaded({ lists: false, library: false, index: false });
    setError(null);
    if (!uid || !accountReady) return;
    const { db } = getFirebase();
    const onError = (e: unknown) => setError(friendlyError(e, "We couldn't load your watchlists."));
    const unsubs = [
      onSnapshot(
        refs.watchlists(db, uid),
        { includeMetadataChanges: true },
        (snap) => {
          setLists(snap.docs.map(toWatchlist).filter((l): l is Watchlist => l !== null));
          setLoaded((s) => ({ ...s, lists: true }));
          setPendingWrites((s) => ({ ...s, lists: snap.metadata.hasPendingWrites }));
        },
        onError,
      ),
      onSnapshot(
        refs.library(db, uid),
        { includeMetadataChanges: true },
        (snap) => {
          setLibrary(snap.docs.map(toLibraryEntry).filter((e): e is LibraryEntry => e !== null));
          setLoaded((s) => ({ ...s, library: true }));
          setPendingWrites((s) => ({ ...s, library: snap.metadata.hasPendingWrites }));
        },
        onError,
      ),
      onSnapshot(
        refs.sharedIndex(db, uid),
        { includeMetadataChanges: true },
        (snap) => {
          setStoredIndex(toSharedIndex(snap));
          setLoaded((s) => ({ ...s, index: true }));
          setPendingWrites((s) => ({ ...s, index: snap.metadata.hasPendingWrites }));
        },
        () => setLoaded((s) => ({ ...s, index: true })),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [uid, accountReady]);

  const ready = Boolean(uid && accountReady && loaded.lists && loaded.library);

  // Always hand mutations the freshest state (avoids stale closures).
  const stateRef = useRef<LibraryState>({ lists, library, privacy });
  useLayoutEffect(() => {
    stateRef.current = { lists, library, privacy };
  });

  // Self-heal the friends-visible index (e.g. after edits on another device
  // or a privacy change). Only runs when everything is synced with the server.
  useEffect(() => {
    if (!uid || !ready || !loaded.index) return;
    if (pendingWrites.lists || pendingWrites.library || pendingWrites.index) return;
    const expected = computeSharedIndex(lists, library, privacy);
    if (storedIndex && sameSharedIndex(expected, storedIndex)) return;
    const timer = setTimeout(() => {
      syncSharedIndex(getFirebase().db, uid, stateRef.current).catch((e) => console.warn("[library] index sync failed", e));
    }, 1200);
    return () => clearTimeout(timer);
  }, [uid, ready, loaded.index, pendingWrites, lists, library, privacy, storedIndex]);

  const summaries = useMemo<ListSummary[]>(() => {
    const byList = new Map<string, LibraryEntry[]>();
    for (const entry of library) {
      for (const id of entry.listIds) {
        if (!byList.has(id)) byList.set(id, []);
        byList.get(id)!.push(entry);
      }
    }
    return lists
      .map((list) => {
        const entries = (byList.get(list.id) ?? []).sort((a, b) => millis(b.addedAt) - millis(a.addedAt));
        return { ...list, count: entries.length, posters: entries.slice(0, 4).map((e) => e.posterPath) };
      })
      .sort((a, b) => millis(a.createdAt) - millis(b.createdAt));
  }, [lists, library]);

  const summariesRef = useRef(summaries);
  useLayoutEffect(() => {
    summariesRef.current = summaries;
  });
  const byMovie = useMemo(() => new Map(library.map((e) => [e.movieId, e])), [library]);
  const listIds = useMemo(() => new Set(lists.map((l) => l.id)), [lists]);
  const defaultList = summaries[0] ?? null;

  // Actions triggered while the library is still loading (e.g. right after
  // signing up) wait for it instead of failing.
  const readyRef = useRef(ready);
  const uidRef = useRef(uid);
  useLayoutEffect(() => {
    readyRef.current = ready;
    uidRef.current = uid;
  });
  const waiters = useRef<(() => void)[]>([]);
  useEffect(() => {
    if (!ready) return;
    const pending = waiters.current;
    waiters.current = [];
    pending.forEach((resolve) => resolve());
  }, [ready]);

  const requireUid = useCallback(async (): Promise<string> => {
    if (!uidRef.current) throw new LibraryError("Sign in to manage your watchlists.");
    if (!readyRef.current) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new LibraryError("Your watchlists are still loading. Please try again.")), 15000);
        waiters.current.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    if (!uidRef.current) throw new LibraryError("Sign in to manage your watchlists.");
    return uidRef.current;
  }, []);

  const createList = useCallback(
    async (input: ListInput, addMovie?: { movie: MovieSnapshot; keepListIds: string[] }) =>
      createListOp(
        getFirebase().db,
        await requireUid(),
        stateRef.current,
        input,
        addMovie ? { movie: addMovie.movie, listIds: addMovie.keepListIds } : undefined,
      ),
    [requireUid],
  );
  const updateList = useCallback(
    async (listId: string, input: ListInput) => updateListOp(getFirebase().db, await requireUid(), stateRef.current, listId, input),
    [requireUid],
  );
  const deleteList = useCallback(async (listId: string) => deleteListOp(getFirebase().db, await requireUid(), stateRef.current, listId), [requireUid]);
  const setMovieLists = useCallback(
    async (movie: MovieSnapshot, ids: string[]) => setMovieListsOp(getFirebase().db, await requireUid(), stateRef.current, movie, ids),
    [requireUid],
  );
  const setWatched = useCallback(
    async (movie: MovieSnapshot, watched: boolean) => setWatchedOp(getFirebase().db, await requireUid(), stateRef.current, movie, watched),
    [requireUid],
  );
  const setRating = useCallback(
    async (movie: MovieSnapshot, rating: number | null) => setRatingOp(getFirebase().db, await requireUid(), stateRef.current, movie, rating),
    [requireUid],
  );

  const quickAdd = useCallback(
    async (movie: MovieSnapshot) => {
      const id = await requireUid();
      const { db } = getFirebase();
      const known = new Set(stateRef.current.lists.map((l) => l.id));
      const current = stateRef.current.library.find((e) => e.movieId === movie.movieId);
      const existing = (current?.listIds ?? []).filter((l) => known.has(l));
      const target = summariesRef.current[0] ?? null;
      if (!target) {
        // No lists yet: create "Watchlist" and add the movie in one batch.
        const newId = await createListOp(db, id, stateRef.current, { name: "Watchlist", visibility: "friends" }, { movie, listIds: existing });
        const now = Timestamp.now();
        const created: ListSummary = { id: newId, name: "Watchlist", description: "", visibility: "friends", createdAt: now, updatedAt: now, count: 1, posters: [movie.posterPath] };
        return created;
      }
      if (!existing.includes(target.id)) await setMovieListsOp(db, id, stateRef.current, movie, [...existing, target.id]);
      return target;
    },
    [requireUid],
  );

  const removeFromList = useCallback(
    async (movie: MovieSnapshot, listId: string) => {
      const current = stateRef.current.library.find((e) => e.movieId === movie.movieId);
      if (!current) return;
      await setMovieListsOp(getFirebase().db, await requireUid(), stateRef.current, movie, current.listIds.filter((l) => l !== listId));
    },
    [requireUid],
  );

  const value = useMemo<LibraryValue>(
    () => ({
      ready,
      error,
      lists: summaries,
      library,
      entryFor: (movieId) => byMovie.get(movieId),
      isSaved: (movieId) => (byMovie.get(movieId)?.listIds ?? []).some((id) => listIds.has(id)),
      defaultList,
      createList,
      updateList,
      deleteList,
      setMovieLists,
      quickAdd,
      removeFromList,
      setWatched,
      setRating,
    }),
    [ready, error, summaries, library, byMovie, listIds, defaultList, createList, updateList, deleteList, setMovieLists, quickAdd, removeFromList, setWatched, setRating],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryValue {
  const value = useContext(LibraryContext);
  if (!value) throw new Error("useLibrary must be used inside LibraryProvider");
  return value;
}
