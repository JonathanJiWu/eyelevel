/**
 * Profiles, unique usernames and first-run setup / legacy migration.
 */
import {
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { computeSharedIndex } from "@/src/lib/sharedIndex";
import { sanitizeMultiline, sanitizeText, usernameFromName, validateUsername } from "@/src/lib/validation";
import { refs, toProfile } from "./refs";
import {
  AVATAR_COLORS,
  DEFAULT_PREFERENCES,
  DEFAULT_PRIVACY,
  LIMITS,
  SCHEMA_VERSION,
  type LibraryEntry,
  type PrivacySettings,
  type Preferences,
  type Profile,
  type UserDoc,
  type Visibility,
  type Watchlist,
} from "./types";

export class UsernameTakenError extends Error {
  constructor(public readonly username: string) {
    super(`@${username} is already taken.`);
    this.name = "UsernameTakenError";
  }
}

const profileCache = new Map<string, { at: number; value: Promise<Profile | null> }>();
const PROFILE_TTL = 2 * 60 * 1000;

export function clearProfileCache() {
  profileCache.clear();
}

export function getProfileCached(db: Firestore, uid: string): Promise<Profile | null> {
  const hit = profileCache.get(uid);
  if (hit && Date.now() - hit.at < PROFILE_TTL) return hit.value;
  const value = getDoc(refs.profile(db, uid))
    .then(toProfile)
    .catch((error) => {
      profileCache.delete(uid);
      throw error;
    });
  profileCache.set(uid, { at: Date.now(), value });
  return value;
}

export function primeProfileCache(profile: Profile) {
  profileCache.set(profile.uid, { at: Date.now(), value: Promise.resolve(profile) });
}

export async function isUsernameAvailable(db: Firestore, username: string, uid?: string): Promise<boolean> {
  const snap = await getDoc(refs.username(db, username.trim().toLowerCase()));
  return !snap.exists() || (uid !== undefined && snap.data()?.uid === uid);
}

function avatarColorFor(uid: string) {
  let hash = 0;
  for (const ch of uid) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

interface LegacyMovie {
  id?: unknown;
  title?: unknown;
  original_title?: unknown;
  poster_path?: unknown;
  release_date?: unknown;
  genre_ids?: unknown;
  genres?: unknown;
  vote_average?: unknown;
  original_language?: unknown;
}

/** Convert legacy v1 watchlist items (raw TMDB objects) into library entries. */
export function legacyEntries(watchlist: unknown[] | undefined, listId: string): LibraryEntry[] {
  if (!Array.isArray(watchlist)) return [];
  const seen = new Set<number>();
  const out: LibraryEntry[] = [];
  for (const raw of watchlist as LegacyMovie[]) {
    const id = typeof raw?.id === "number" ? raw.id : Number(raw?.id);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    const title = typeof raw.title === "string" ? raw.title : typeof raw.original_title === "string" ? raw.original_title : null;
    if (!title) continue;
    seen.add(id);
    const date = typeof raw.release_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.release_date) ? raw.release_date : null;
    const genreIds = Array.isArray(raw.genre_ids)
      ? raw.genre_ids.filter((g): g is number => Number.isInteger(g))
      : Array.isArray(raw.genres)
        ? (raw.genres as { id?: unknown }[]).map((g) => g?.id).filter((g): g is number => Number.isInteger(g))
        : [];
    out.push({
      movieId: id,
      title: sanitizeText(title, 300),
      posterPath: typeof raw.poster_path === "string" && raw.poster_path.startsWith("/") ? raw.poster_path : null,
      releaseDate: date,
      year: date ? Number(date.slice(0, 4)) : null,
      genreIds: genreIds.slice(0, 20),
      voteAverage: typeof raw.vote_average === "number" ? Math.round(raw.vote_average * 10) / 10 : 0,
      originalLanguage: typeof raw.original_language === "string" ? raw.original_language : null,
      listIds: [listId],
      watched: false,
      watchedAt: null,
      rating: null,
      ratedAt: null,
      addedAt: null,
      updatedAt: null,
    });
  }
  return out;
}

export interface SetupInput {
  uid: string;
  email: string | null;
  displayName: string;
  username: string;
  /** Existing users/{uid} doc (legacy v1 data), if any. */
  existing: UserDoc | null;
  /** Whether the user already has v2 watchlists (skip creating a default list). */
  hasLists: boolean;
}

/**
 * Only call this when the profile is known NOT to exist (a confirmed server
 * read): re-running it for an existing account is rejected by the rules.
 *
 * Create profile + username claim + private user doc + a default list, and
 * migrate legacy v1 data (users/{uid}.watchlist) into the new structure.
 * Legacy fields are left untouched (non-destructive); schemaVersion marks
 * the migration as done.
 */
export async function setupAccount(db: Firestore, input: SetupInput): Promise<Profile> {
  const usernameError = validateUsername(input.username);
  if (usernameError) throw new Error(usernameError);
  const username = input.username.trim();
  const usernameLower = username.toLowerCase();
  if (!(await isUsernameAvailable(db, username, input.uid))) throw new UsernameTakenError(username);

  const displayName = sanitizeText(input.displayName, LIMITS.displayName) || username;
  const isLegacy = Boolean(input.existing && (input.existing.schemaVersion ?? 1) < SCHEMA_VERSION);
  const legacyCount = isLegacy && Array.isArray(input.existing?.watchlist) ? input.existing!.watchlist!.length : 0;

  const batch = writeBatch(db);
  batch.set(refs.username(db, usernameLower), { uid: input.uid, createdAt: serverTimestamp() });
  const profileData = {
    uid: input.uid,
    displayName,
    displayNameLower: displayName.toLowerCase(),
    username,
    usernameLower,
    bio: "",
    avatarColor: avatarColorFor(input.uid),
    discoverable: true,
    allowFriendRequests: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  batch.set(refs.profile(db, input.uid), profileData);
  batch.set(
    refs.user(db, input.uid),
    {
      email: input.email,
      privacy: input.existing?.privacy ?? DEFAULT_PRIVACY,
      preferences: input.existing?.preferences ?? DEFAULT_PREFERENCES,
      schemaVersion: SCHEMA_VERSION,
      ...(isLegacy ? { migratedAt: serverTimestamp() } : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  let lists: Watchlist[] = [];
  let library: LibraryEntry[] = [];
  let overflow: LibraryEntry[] = [];
  if (!input.hasLists) {
    const listRef = doc(refs.watchlists(db, input.uid));
    const now = Timestamp.now();
    // Imported legacy data stays private until the user chooses to share it.
    const visibility: Visibility = legacyCount > 0 ? "private" : "friends";
    const list: Watchlist = {
      id: listRef.id,
      name: "Watchlist",
      description: legacyCount > 0 ? "Imported from your previous watchlist." : "",
      visibility,
      createdAt: now,
      updatedAt: now,
    };
    batch.set(listRef, { name: list.name, description: list.description, visibility, createdAt: now, updatedAt: now });
    lists = [list];
    if (legacyCount > 0) {
      const imported = legacyEntries(input.existing!.watchlist, listRef.id);
      library = imported.slice(0, 400);
      overflow = imported.slice(400);
      for (const entry of library) batch.set(refs.libraryEntry(db, input.uid, entry.movieId), importedEntryData(entry));
    }
    batch.set(refs.sharedIndex(db, input.uid), {
      ...computeSharedIndex(lists, library, input.existing?.privacy ?? DEFAULT_PRIVACY),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  // Very large legacy watchlists: import the remainder in further batches.
  // The imported list is private, so the shared index is unaffected.
  for (let i = 0; i < overflow.length; i += 450) {
    const extra = writeBatch(db);
    for (const entry of overflow.slice(i, i + 450)) extra.set(refs.libraryEntry(db, input.uid, entry.movieId), importedEntryData(entry));
    await extra.commit();
  }
  const profile: Profile = { ...profileData, createdAt: Timestamp.now(), updatedAt: Timestamp.now() };
  primeProfileCache(profile);
  return profile;
}

function importedEntryData(entry: LibraryEntry) {
  const { movieId, title, posterPath, releaseDate, year, genreIds, voteAverage, originalLanguage, listIds } = entry;
  return {
    movieId,
    title,
    posterPath,
    releaseDate,
    year,
    genreIds,
    voteAverage,
    originalLanguage,
    listIds,
    watched: false,
    watchedAt: null,
    rating: null,
    ratedAt: null,
    addedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

/** Setup with an auto-generated username, retrying on collisions. */
export async function setupAccountWithGeneratedUsername(
  db: Firestore,
  input: Omit<SetupInput, "username"> & { preferredUsername?: string },
): Promise<Profile> {
  const base = usernameFromName(input.preferredUsername || input.displayName || input.email || "user");
  const candidates = [base, ...Array.from({ length: 5 }, () => `${base.slice(0, 14)}${Math.floor(1000 + Math.random() * 9000)}`)];
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await setupAccount(db, { ...input, username: candidate });
    } catch (error) {
      lastError = error;
      if (!(error instanceof UsernameTakenError)) throw error;
    }
  }
  throw lastError;
}

export interface ProfilePatch {
  displayName?: string;
  username?: string;
  bio?: string;
  avatarColor?: string;
  discoverable?: boolean;
  allowFriendRequests?: boolean;
}

export async function updateProfile(db: Firestore, current: Profile, patch: ProfilePatch): Promise<void> {
  const batch = writeBatch(db);
  const data: DocumentData = { updatedAt: serverTimestamp() };
  if (patch.displayName !== undefined) {
    const displayName = sanitizeText(patch.displayName, LIMITS.displayName);
    if (!displayName) throw new Error("Enter a display name.");
    data.displayName = displayName;
    data.displayNameLower = displayName.toLowerCase();
  }
  if (patch.bio !== undefined) data.bio = sanitizeMultiline(patch.bio, LIMITS.bio);
  if (patch.avatarColor !== undefined) {
    if (!AVATAR_COLORS.includes(patch.avatarColor)) throw new Error("Pick one of the available colors.");
    data.avatarColor = patch.avatarColor;
  }
  if (patch.discoverable !== undefined) data.discoverable = patch.discoverable;
  if (patch.allowFriendRequests !== undefined) data.allowFriendRequests = patch.allowFriendRequests;
  if (patch.username !== undefined && patch.username.trim() !== current.username) {
    const error = validateUsername(patch.username);
    if (error) throw new Error(error);
    const username = patch.username.trim();
    const lower = username.toLowerCase();
    if (lower !== current.usernameLower) {
      if (!(await isUsernameAvailable(db, username, current.uid))) throw new UsernameTakenError(username);
      batch.set(refs.username(db, lower), { uid: current.uid, createdAt: serverTimestamp() });
      batch.delete(refs.username(db, current.usernameLower));
    }
    data.username = username;
    data.usernameLower = lower;
  }
  batch.update(refs.profile(db, current.uid), data);
  await batch.commit();
  profileCache.delete(current.uid);
}

export async function updatePrivacy(db: Firestore, uid: string, privacy: PrivacySettings) {
  const batch = writeBatch(db);
  batch.update(refs.user(db, uid), {
    privacy: { shareWatched: privacy.shareWatched, shareRatings: privacy.shareRatings },
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function updatePreferences(db: Firestore, uid: string, preferences: Preferences) {
  const favoriteGenres = Array.from(new Set(preferences.favoriteGenres.filter(Number.isInteger))).slice(0, LIMITS.favoriteGenres);
  const preferredLanguage = preferences.preferredLanguage && /^[a-z]{2}$/.test(preferences.preferredLanguage) ? preferences.preferredLanguage : null;
  const batch = writeBatch(db);
  batch.update(refs.user(db, uid), { preferences: { favoriteGenres, preferredLanguage }, updatedAt: serverTimestamp() });
  await batch.commit();
}

/** Prefix search over discoverable profiles by username and display name. */
export async function searchProfiles(db: Firestore, term: string, excludeUid?: string): Promise<Profile[]> {
  const q = term.trim().replace(/^@/, "").toLowerCase();
  if (q.length < 2) return [];
  const end = `${q}`;
  const byUsername = query(
    refs.profiles(db),
    where("discoverable", "==", true),
    where("usernameLower", ">=", q),
    where("usernameLower", "<=", end),
    orderBy("usernameLower"),
    limit(10),
  );
  const byName = query(
    refs.profiles(db),
    where("discoverable", "==", true),
    where("displayNameLower", ">=", q),
    where("displayNameLower", "<=", end),
    orderBy("displayNameLower"),
    limit(10),
  );
  const [a, b] = await Promise.all([getDocs(byUsername), getDocs(byName)]);
  const seen = new Set<string>();
  const results: Profile[] = [];
  for (const snap of [...a.docs, ...b.docs]) {
    const profile = toProfile(snap);
    if (!profile || profile.uid === excludeUid || seen.has(profile.uid)) continue;
    seen.add(profile.uid);
    primeProfileCache(profile);
    results.push(profile);
  }
  return results.sort((x, y) => {
    const xs = x.usernameLower.startsWith(q) ? 0 : 1;
    const ys = y.usernameLower.startsWith(q) ? 0 : 1;
    return xs - ys || x.displayName.localeCompare(y.displayName);
  });
}
