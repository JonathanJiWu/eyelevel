/**
 * Friends, friend requests and friends' shared watchlist data.
 * Only each friend's shared index is read — never their private data —
 * and Firestore rules enforce that server-side.
 */
import { onSnapshot, query, where } from "firebase/firestore";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  removeFriend as removeFriendOp,
  sendFriendRequest,
} from "@/src/data/friends";
import { getProfileCached } from "@/src/data/profile";
import { refs, toFriendRequest, toFriendship, toSharedIndex } from "@/src/data/refs";
import type { FriendRequest, Friendship, Profile, SharedIndex } from "@/src/data/types";
import { friendlyError } from "@/src/lib/errors";
import { getFirebase } from "@/src/lib/firebase";
import { useAuth } from "./AuthContext";

export type Relationship = "self" | "friend" | "incoming" | "outgoing" | "none";

export interface FriendInfo {
  uid: string;
  profile: Profile | null;
  since: Friendship["createdAt"];
  index: SharedIndex | null;
  indexLoaded: boolean;
}

export interface RequestInfo {
  uid: string;
  profile: Profile | null;
  createdAt: FriendRequest["createdAt"];
}

export interface FriendSave {
  friend: FriendInfo;
  listNames: string[];
  watched: boolean;
  rating: number | null;
}

interface SocialValue {
  ready: boolean;
  error: string | null;
  friends: FriendInfo[];
  incoming: RequestInfo[];
  outgoing: RequestInfo[];
  relationship: (uid: string) => Relationship;
  friend: (uid: string) => FriendInfo | undefined;
  sendRequest: (uid: string) => Promise<"sent" | "accepted">;
  cancelRequest: (uid: string) => Promise<void>;
  acceptRequest: (uid: string) => Promise<void>;
  declineRequest: (uid: string) => Promise<void>;
  removeFriend: (uid: string) => Promise<void>;
  friendsWhoSaved: (movieId: number) => FriendSave[];
}

const SocialContext = createContext<SocialValue | null>(null);

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const { user, accountReady } = useAuth();
  const uid = user?.uid ?? null;
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [incomingRaw, setIncomingRaw] = useState<FriendRequest[]>([]);
  const [outgoingRaw, setOutgoingRaw] = useState<FriendRequest[]>([]);
  const [loaded, setLoaded] = useState({ friends: false, incoming: false, outgoing: false });
  const [profiles, setProfiles] = useState<Record<string, Profile | null>>({});
  const [indexes, setIndexes] = useState<Record<string, SharedIndex | null>>({});
  const [error, setError] = useState<string | null>(null);
  const indexSubs = useRef(new Map<string, () => void>());

  useEffect(() => {
    setFriendships([]);
    setIncomingRaw([]);
    setOutgoingRaw([]);
    setLoaded({ friends: false, incoming: false, outgoing: false });
    setProfiles({});
    setIndexes({});
    setError(null);
    if (!uid || !accountReady) return;
    const { db } = getFirebase();
    const onError = (e: unknown) => setError(friendlyError(e, "We couldn't load your friends."));
    const unsubs = [
      onSnapshot(
        query(refs.friendships(db), where("members", "array-contains", uid)),
        (snap) => {
          setFriendships(snap.docs.map(toFriendship).filter((f): f is Friendship => f !== null));
          setLoaded((s) => ({ ...s, friends: true }));
        },
        onError,
      ),
      onSnapshot(
        query(refs.friendRequests(db), where("to", "==", uid)),
        (snap) => {
          setIncomingRaw(snap.docs.map(toFriendRequest).filter((r): r is FriendRequest => r !== null));
          setLoaded((s) => ({ ...s, incoming: true }));
        },
        onError,
      ),
      onSnapshot(
        query(refs.friendRequests(db), where("from", "==", uid)),
        (snap) => {
          setOutgoingRaw(snap.docs.map(toFriendRequest).filter((r): r is FriendRequest => r !== null));
          setLoaded((s) => ({ ...s, outgoing: true }));
        },
        onError,
      ),
    ];
    const subs = indexSubs.current;
    return () => {
      unsubs.forEach((u) => u());
      subs.forEach((u) => u());
      subs.clear();
    };
  }, [uid, accountReady]);

  const friendIds = useMemo(
    () => friendships.map((f) => (f.members[0] === uid ? f.members[1] : f.members[0])).filter(Boolean),
    [friendships, uid],
  );

  // Load profiles for friends and request counterparts.
  useEffect(() => {
    if (!uid) return;
    const { db } = getFirebase();
    const wanted = new Set([...friendIds, ...incomingRaw.map((r) => r.from), ...outgoingRaw.map((r) => r.to)]);
    let cancelled = false;
    for (const id of wanted) {
      if (id in profiles) continue;
      getProfileCached(db, id)
        .then((profile) => !cancelled && setProfiles((p) => ({ ...p, [id]: profile })))
        .catch(() => !cancelled && setProfiles((p) => ({ ...p, [id]: null })));
    }
    return () => {
      cancelled = true;
    };
  }, [uid, friendIds, incomingRaw, outgoingRaw, profiles]);

  // Live shared-index listeners for current friends.
  useEffect(() => {
    if (!uid) return;
    const { db } = getFirebase();
    const subs = indexSubs.current;
    const wanted = new Set(friendIds);
    for (const [id, unsub] of subs) {
      if (!wanted.has(id)) {
        unsub();
        subs.delete(id);
        setIndexes((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
    }
    for (const id of wanted) {
      if (subs.has(id)) continue;
      subs.set(
        id,
        onSnapshot(
          refs.sharedIndex(db, id),
          (snap) => setIndexes((current) => ({ ...current, [id]: toSharedIndex(snap) })),
          () => setIndexes((current) => ({ ...current, [id]: null })),
        ),
      );
    }
  }, [uid, friendIds]);

  const friends = useMemo<FriendInfo[]>(
    () =>
      friendships
        .map((f) => {
          const other = f.members[0] === uid ? f.members[1] : f.members[0];
          return { uid: other, profile: profiles[other] ?? null, since: f.createdAt, index: indexes[other] ?? null, indexLoaded: other in indexes };
        })
        .sort((a, b) => (a.profile?.displayName ?? "").localeCompare(b.profile?.displayName ?? "")),
    [friendships, profiles, indexes, uid],
  );

  const incoming = useMemo(
    () => incomingRaw.map((r) => ({ uid: r.from, profile: profiles[r.from] ?? null, createdAt: r.createdAt })),
    [incomingRaw, profiles],
  );
  const outgoing = useMemo(
    () => outgoingRaw.map((r) => ({ uid: r.to, profile: profiles[r.to] ?? null, createdAt: r.createdAt })),
    [outgoingRaw, profiles],
  );

  const relationship = useCallback(
    (other: string): Relationship => {
      if (other === uid) return "self";
      if (friendIds.includes(other)) return "friend";
      if (incomingRaw.some((r) => r.from === other)) return "incoming";
      if (outgoingRaw.some((r) => r.to === other)) return "outgoing";
      return "none";
    },
    [uid, friendIds, incomingRaw, outgoingRaw],
  );

  const requireUid = useCallback(() => {
    if (!uid) throw new Error("Sign in to manage friends.");
    return uid;
  }, [uid]);

  const value = useMemo<SocialValue>(
    () => ({
      ready: Boolean(uid && loaded.friends && loaded.incoming && loaded.outgoing),
      error,
      friends,
      incoming,
      outgoing,
      relationship,
      friend: (other) => friends.find((f) => f.uid === other),
      sendRequest: (other) => sendFriendRequest(getFirebase().db, requireUid(), other),
      cancelRequest: (other) => cancelFriendRequest(getFirebase().db, requireUid(), other),
      acceptRequest: (other) => acceptFriendRequest(getFirebase().db, requireUid(), other),
      declineRequest: (other) => declineFriendRequest(getFirebase().db, requireUid(), other),
      removeFriend: (other) => removeFriendOp(getFirebase().db, requireUid(), other),
      friendsWhoSaved: (movieId) => {
        const out: FriendSave[] = [];
        for (const friend of friends) {
          const movie = friend.index?.movies?.[String(movieId)];
          if (!movie) continue;
          const listNames = (movie.l ?? []).map((id) => friend.index?.lists?.[id]?.n).filter((n): n is string => Boolean(n));
          out.push({ friend, listNames, watched: movie.w === true, rating: typeof movie.r === "number" ? movie.r : null });
        }
        return out;
      },
    }),
    [uid, loaded, error, friends, incoming, outgoing, relationship, requireUid],
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial(): SocialValue {
  const value = useContext(SocialContext);
  if (!value) throw new Error("useSocial must be used inside SocialProvider");
  return value;
}
