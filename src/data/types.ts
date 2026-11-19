/**
 * Firestore data model (schema version 2).
 *
 *   profiles/{uid}                     public profile (any signed-in user can read;
 *                                      only discoverable profiles are searchable)
 *   usernames/{usernameLower}          unique username claims -> { uid }
 *   users/{uid}                        PRIVATE account doc (owner only)
 *   users/{uid}/watchlists/{listId}    owner only
 *   users/{uid}/library/{movieId}      one doc per movie the user saved/watched/rated (owner only)
 *   users/{uid}/activity/{id}          owner-only activity log
 *   users/{uid}/shared/index           friends-readable summary of ONLY what the
 *                                      owner chose to share (friends-visible lists,
 *                                      optionally watched status and ratings)
 *   friendRequests/{fromUid}_{toUid}   pending requests (sender + recipient can read)
 *   friendships/{uidA}_{uidB}          accepted friendships, uidA < uidB (members can read)
 *
 * Firestore security rules (firestore.rules) enforce these boundaries on the
 * backend; the client code below never relies on hiding data in the UI.
 */
import type { Timestamp } from "firebase/firestore";

export const SCHEMA_VERSION = 2;

export type Visibility = "private" | "friends";

export interface Profile {
  uid: string;
  displayName: string;
  displayNameLower: string;
  username: string;
  usernameLower: string;
  bio: string;
  avatarColor: string;
  discoverable: boolean;
  allowFriendRequests: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PrivacySettings {
  shareWatched: boolean;
  shareRatings: boolean;
}

export interface Preferences {
  favoriteGenres: number[];
  preferredLanguage: string | null;
}

export interface UserDoc {
  email: string | null;
  privacy: PrivacySettings;
  preferences: Preferences;
  schemaVersion: number;
  migratedAt?: Timestamp | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  /** Legacy (v1) fields — kept untouched for safety, no longer used. */
  watchlist?: unknown[];
  name?: string;
  friends?: unknown[];
}

export interface Watchlist {
  id: string;
  name: string;
  description: string;
  visibility: Visibility;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

/** The subset of movie data stored with a user's library entries. */
export interface MovieSnapshot {
  movieId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  year: number | null;
  genreIds: number[];
  voteAverage: number;
  originalLanguage: string | null;
}

export interface LibraryEntry extends MovieSnapshot {
  listIds: string[];
  watched: boolean;
  watchedAt: Timestamp | null;
  /** 1–5 stars, or null when unrated. */
  rating: number | null;
  ratedAt: Timestamp | null;
  addedAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type ActivityType =
  | "added"
  | "removed"
  | "rated"
  | "unrated"
  | "watched"
  | "unwatched"
  | "list_created"
  | "list_updated"
  | "list_deleted"
  | "friend_added";

export interface Activity {
  id: string;
  type: ActivityType;
  movieId: number | null;
  title: string | null;
  listId: string | null;
  listName: string | null;
  rating: number | null;
  createdAt: Timestamp | null;
}

/** Compact per-movie entry in the friends-visible shared index. */
export interface SharedMovie {
  /** title */
  t: string;
  /** poster path */
  p: string | null;
  /** release year */
  y: number | null;
  /** genre ids (first few) */
  g: number[];
  /** ids of friends-visible lists containing the movie */
  l: string[];
  /** watched (only when the owner shares watched status) */
  w?: boolean;
  /** rating 1–5 (only when the owner shares ratings) */
  r?: number;
}

export interface SharedList {
  /** name */
  n: string;
  /** description */
  d: string;
  /** movie count */
  c: number;
  /** last updated (epoch ms) */
  u: number;
}

export interface SharedIndexData {
  version: 1;
  movies: Record<string, SharedMovie>;
  lists: Record<string, SharedList>;
}

export interface SharedIndex extends SharedIndexData {
  updatedAt: Timestamp | null;
}

export interface FriendRequest {
  id: string;
  from: string;
  to: string;
  createdAt: Timestamp | null;
}

export interface Friendship {
  id: string;
  members: [string, string];
  requestedBy: string;
  createdAt: Timestamp | null;
}

export const DEFAULT_PRIVACY: PrivacySettings = { shareWatched: true, shareRatings: true };
export const DEFAULT_PREFERENCES: Preferences = { favoriteGenres: [], preferredLanguage: null };

export const LIMITS = {
  displayName: 40,
  username: { min: 3, max: 20 },
  bio: 160,
  listName: 60,
  listDescription: 280,
  listsPerUser: 50,
  listIdsPerMovie: 50,
  favoriteGenres: 10,
  sharedMovies: 4000,
} as const;

export const AVATAR_COLORS = ["#5C6BC0", "#1E88E5", "#00897B", "#43A047", "#F4511E", "#8E24AA", "#D81B60", "#6D4C41", "#3949AB", "#00ACC1"];

export const pairId = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
export const requestId = (from: string, to: string) => `${from}_${to}`;
