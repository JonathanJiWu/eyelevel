import { collection, doc, type DocumentData, type DocumentSnapshot, type Firestore, Timestamp } from "firebase/firestore";
import {
  DEFAULT_PREFERENCES,
  DEFAULT_PRIVACY,
  type Activity,
  type ActivityType,
  type FriendRequest,
  type Friendship,
  type LibraryEntry,
  type Profile,
  type SharedIndex,
  type UserDoc,
  type Watchlist,
} from "./types";

export const refs = {
  profile: (db: Firestore, uid: string) => doc(db, "profiles", uid),
  profiles: (db: Firestore) => collection(db, "profiles"),
  username: (db: Firestore, usernameLower: string) => doc(db, "usernames", usernameLower),
  user: (db: Firestore, uid: string) => doc(db, "users", uid),
  watchlists: (db: Firestore, uid: string) => collection(db, "users", uid, "watchlists"),
  watchlist: (db: Firestore, uid: string, listId: string) => doc(db, "users", uid, "watchlists", listId),
  library: (db: Firestore, uid: string) => collection(db, "users", uid, "library"),
  libraryEntry: (db: Firestore, uid: string, movieId: number) => doc(db, "users", uid, "library", String(movieId)),
  activity: (db: Firestore, uid: string) => collection(db, "users", uid, "activity"),
  sharedIndex: (db: Firestore, uid: string) => doc(db, "users", uid, "shared", "index"),
  friendRequests: (db: Firestore) => collection(db, "friendRequests"),
  friendRequest: (db: Firestore, id: string) => doc(db, "friendRequests", id),
  friendships: (db: Firestore) => collection(db, "friendships"),
  friendship: (db: Firestore, id: string) => doc(db, "friendships", id),
};

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const strOrNull = (v: unknown) => (typeof v === "string" && v ? v : null);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const ts = (v: unknown) => (v instanceof Timestamp ? v : null);
const intOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
const intList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && Number.isInteger(x)) : []);
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function toProfile(snap: DocumentSnapshot<DocumentData>): Profile | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  const username = str(d.username, "user");
  const displayName = str(d.displayName, username);
  return {
    uid: snap.id,
    displayName,
    displayNameLower: str(d.displayNameLower, displayName.toLowerCase()),
    username,
    usernameLower: str(d.usernameLower, username.toLowerCase()),
    bio: str(d.bio),
    avatarColor: str(d.avatarColor, "#5C6BC0"),
    discoverable: bool(d.discoverable, true),
    allowFriendRequests: bool(d.allowFriendRequests, true),
    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
  };
}

export function toUserDoc(snap: DocumentSnapshot<DocumentData>): UserDoc | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  const privacy = (d.privacy ?? {}) as Record<string, unknown>;
  const preferences = (d.preferences ?? {}) as Record<string, unknown>;
  return {
    email: strOrNull(d.email),
    privacy: {
      shareWatched: bool(privacy.shareWatched, DEFAULT_PRIVACY.shareWatched),
      shareRatings: bool(privacy.shareRatings, DEFAULT_PRIVACY.shareRatings),
    },
    preferences: {
      favoriteGenres: intList(preferences.favoriteGenres),
      preferredLanguage: strOrNull(preferences.preferredLanguage) ?? DEFAULT_PREFERENCES.preferredLanguage,
    },
    schemaVersion: typeof d.schemaVersion === "number" ? d.schemaVersion : 1,
    migratedAt: ts(d.migratedAt),
    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
    watchlist: Array.isArray(d.watchlist) ? d.watchlist : undefined,
    name: typeof d.name === "string" ? d.name : undefined,
    friends: Array.isArray(d.friends) ? d.friends : undefined,
  };
}

export function toWatchlist(snap: DocumentSnapshot<DocumentData>): Watchlist | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    name: str(d.name, "Untitled list"),
    description: str(d.description),
    visibility: d.visibility === "friends" ? "friends" : "private",
    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
  };
}

export function toLibraryEntry(snap: DocumentSnapshot<DocumentData>): LibraryEntry | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  const movieId = intOrNull(d.movieId) ?? Number(snap.id);
  if (!Number.isInteger(movieId) || movieId <= 0) return null;
  const rating = intOrNull(d.rating);
  return {
    movieId,
    title: str(d.title, "Untitled"),
    posterPath: strOrNull(d.posterPath),
    releaseDate: strOrNull(d.releaseDate),
    year: intOrNull(d.year),
    genreIds: intList(d.genreIds),
    voteAverage: typeof d.voteAverage === "number" ? d.voteAverage : 0,
    originalLanguage: strOrNull(d.originalLanguage),
    listIds: strList(d.listIds),
    watched: bool(d.watched, false),
    watchedAt: ts(d.watchedAt),
    rating: rating && rating >= 1 && rating <= 5 ? rating : null,
    ratedAt: ts(d.ratedAt),
    addedAt: ts(d.addedAt),
    updatedAt: ts(d.updatedAt),
  };
}

const ACTIVITY_TYPES: ActivityType[] = [
  "added",
  "removed",
  "rated",
  "unrated",
  "watched",
  "unwatched",
  "list_created",
  "list_updated",
  "list_deleted",
  "friend_added",
];

export function toActivity(snap: DocumentSnapshot<DocumentData>): Activity | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  if (!ACTIVITY_TYPES.includes(d.type)) return null;
  return {
    id: snap.id,
    type: d.type,
    movieId: intOrNull(d.movieId),
    title: strOrNull(d.title),
    listId: strOrNull(d.listId),
    listName: strOrNull(d.listName),
    rating: intOrNull(d.rating),
    createdAt: ts(d.createdAt),
  };
}

export function toSharedIndex(snap: DocumentSnapshot<DocumentData>): SharedIndex | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    version: 1,
    movies: d.movies && typeof d.movies === "object" ? d.movies : {},
    lists: d.lists && typeof d.lists === "object" ? d.lists : {},
    updatedAt: ts(d.updatedAt),
  };
}

export function toFriendRequest(snap: DocumentSnapshot<DocumentData>): FriendRequest | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  if (typeof d.from !== "string" || typeof d.to !== "string") return null;
  return { id: snap.id, from: d.from, to: d.to, createdAt: ts(d.createdAt) };
}

export function toFriendship(snap: DocumentSnapshot<DocumentData>): Friendship | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  const members = strList(d.members);
  if (members.length !== 2) return null;
  return {
    id: snap.id,
    members: [members[0], members[1]],
    requestedBy: str(d.requestedBy),
    createdAt: ts(d.createdAt),
  };
}
