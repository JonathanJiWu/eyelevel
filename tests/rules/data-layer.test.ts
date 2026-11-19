/**
 * Integration tests: the app's real data-layer functions (src/data/*) run
 * against the Firestore emulator with security rules enforced. They prove the
 * write shapes the app produces pass the rules end to end, and that friends
 * can read exactly the shared index (computeSharedIndex), nothing else.
 *
 * Needs the Firestore emulator: run with `npm run test:rules`.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { deleteUserData } from "@/src/data/account";
import { acceptFriendRequest, cancelFriendRequest, declineFriendRequest, FriendError, removeFriend, sendFriendRequest } from "@/src/data/friends";
import {
  clearActivity,
  createList,
  deleteList,
  LibraryError,
  setMovieLists,
  setRating,
  setWatched,
  snapshotFromMovie,
  syncSharedIndex,
  updateList,
  type LibraryState,
} from "@/src/data/library";
import {
  clearProfileCache,
  searchProfiles,
  setupAccount,
  setupAccountWithGeneratedUsername,
  updatePreferences,
  updatePrivacy,
  updateProfile,
  UsernameTakenError,
} from "@/src/data/profile";
import { refs, toActivity, toFriendRequest, toFriendship, toLibraryEntry, toProfile, toSharedIndex, toUserDoc, toWatchlist } from "@/src/data/refs";
import {
  AVATAR_COLORS,
  DEFAULT_PREFERENCES,
  DEFAULT_PRIVACY,
  SCHEMA_VERSION,
  type ActivityType,
  type MovieSnapshot,
  type Profile,
  type SharedIndex,
  type SharedMovie,
} from "@/src/data/types";
import { computeSharedIndex } from "@/src/lib/sharedIndex";

jest.setTimeout(60_000);

let testEnv: RulesTestEnvironment;
let clients = new Map<string, Firestore>();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-eyelevel",
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  clients = new Map();
  clearProfileCache();
});

// ---------------------------------------------------------------- helpers

/** The `db` the app would pass for a signed-in user (same settings as src/lib/firebase.ts). */
function dbFor(uid: string): Firestore {
  let db = clients.get(uid);
  if (!db) {
    db = testEnv
      .authenticatedContext(uid, { email: `${uid}@example.com` })
      .firestore({ ignoreUndefinedProperties: true, merge: true }) as unknown as Firestore;
    clients.set(uid, db);
  }
  return db;
}

async function asAdmin<T>(fn: (db: Firestore) => Promise<T>): Promise<T> {
  let result: T | undefined;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    result = await fn(ctx.firestore() as unknown as Firestore);
  });
  return result as T;
}

const adminGet = (path: string) => asAdmin(async (db) => (await getDoc(doc(db, path))).data());
const adminIds = (path: string) => asAdmin(async (db) => (await getDocs(collection(db, path))).docs.map((d) => d.id).sort());
const adminSet = (path: string, data: DocumentData) => asAdmin((db) => setDoc(doc(db, path), data));

const present = <T>(value: T | null): value is T => value !== null;

interface Account {
  uid: string;
  db: Firestore;
  profile: Profile;
}

async function signUp(uid: string, opts: { username?: string; displayName?: string } = {}): Promise<Account> {
  const db = dbFor(uid);
  const profile = await setupAccount(db, {
    uid,
    email: `${uid}@example.com`,
    displayName: opts.displayName ?? uid,
    username: opts.username ?? uid,
    existing: null,
    hasLists: false,
  });
  return { uid, db, profile };
}

/** Build the LibraryState the app keeps, from the user's current docs (through the rules). */
async function loadState(db: Firestore, uid: string): Promise<LibraryState> {
  const [user, lists, library] = await Promise.all([
    getDoc(refs.user(db, uid)),
    getDocs(refs.watchlists(db, uid)),
    getDocs(refs.library(db, uid)),
  ]);
  return {
    lists: lists.docs.map(toWatchlist).filter(present),
    library: library.docs.map(toLibraryEntry).filter(present),
    privacy: toUserDoc(user)?.privacy ?? DEFAULT_PRIVACY,
  };
}

/** Run a data-layer mutation with freshly loaded state, like the UI does. */
const withState = async <T>(account: Account, fn: (state: LibraryState) => Promise<T>) => fn(await loadState(account.db, account.uid));

const entryOf = (state: LibraryState, movie: MovieSnapshot) => state.library.find((e) => e.movieId === movie.movieId);

/** The stored shared index must equal computeSharedIndex() over the stored private docs. */
async function expectSharedIndexInSync(account: Account): Promise<SharedIndex> {
  const state = await loadState(account.db, account.uid);
  const shared = toSharedIndex(await getDoc(refs.sharedIndex(account.db, account.uid)));
  expect(shared).not.toBeNull();
  const { version, movies, lists } = shared!;
  expect({ version, movies, lists }).toEqual(computeSharedIndex(state.lists, state.library, state.privacy));
  expect(shared!.updatedAt).toBeInstanceOf(Timestamp);
  return shared!;
}

async function activityTypes(account: Account): Promise<ActivityType[]> {
  const snap = await getDocs(refs.activity(account.db, account.uid));
  return snap.docs.map(toActivity).filter(present).map((a) => a.type).sort();
}

const movie = (id: number, title: string, year: number): MovieSnapshot =>
  snapshotFromMovie({
    id,
    title,
    posterPath: `/${id}.jpg`,
    releaseDate: `${year}-06-01`,
    year,
    genreIds: [28, 878, 12, 14],
    voteAverage: 7.25,
    originalLanguage: "en",
  });

const matrix = movie(603, "The Matrix", 1999);
const alien = movie(348, "Alien", 1979);
const heat = movie(949, "Heat", 1995);
const up = movie(14160, "Up", 2009);
const jaws = movie(578, "Jaws", 1975);

/** Expected SharedMovie for a movie (list ids are stored sorted). */
const sharedMovie = (m: MovieSnapshot, listIds: string[], extra: Partial<SharedMovie> = {}): SharedMovie => ({
  t: m.title,
  p: m.posterPath,
  y: m.year,
  g: m.genreIds.slice(0, 3),
  l: [...listIds].sort(),
  ...extra,
});

async function caught(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("Expected the promise to reject");
}

// ------------------------------------------------------------------ tests

describe("account setup", () => {
  test("setupAccount creates profile, username claim, private user doc, default Watchlist and shared index", async () => {
    const db = dbFor("alice");
    const profile = await setupAccount(db, {
      uid: "alice",
      email: "alice@example.com",
      displayName: "  Alice   Liddell ",
      username: "Alice_L",
      existing: null,
      hasLists: false,
    });
    const expected = {
      uid: "alice",
      username: "Alice_L",
      usernameLower: "alice_l",
      displayName: "Alice Liddell",
      displayNameLower: "alice liddell",
      bio: "",
      discoverable: true,
      allowFriendRequests: true,
    };
    expect(profile).toMatchObject(expected);

    const stored = toProfile(await getDoc(refs.profile(db, "alice")));
    expect(stored).toMatchObject(expected);
    expect(AVATAR_COLORS).toContain(stored!.avatarColor);
    expect(stored!.createdAt).toBeInstanceOf(Timestamp);

    expect((await getDoc(refs.username(db, "alice_l"))).data()).toMatchObject({ uid: "alice" });

    const user = toUserDoc(await getDoc(refs.user(db, "alice")));
    expect(user).toMatchObject({
      email: "alice@example.com",
      privacy: DEFAULT_PRIVACY,
      preferences: DEFAULT_PREFERENCES,
      schemaVersion: SCHEMA_VERSION,
      migratedAt: null,
    });
    expect(user!.createdAt).toBeInstanceOf(Timestamp);

    const account = { uid: "alice", db, profile };
    const state = await loadState(db, "alice");
    expect(state.lists).toHaveLength(1);
    expect(state.lists[0]).toMatchObject({ name: "Watchlist", description: "", visibility: "friends" });
    expect(state.library).toEqual([]);

    const shared = await expectSharedIndexInSync(account);
    expect(shared.movies).toEqual({});
    expect(Object.keys(shared.lists)).toEqual([state.lists[0].id]);
    expect(shared.lists[state.lists[0].id]).toMatchObject({ n: "Watchlist", d: "", c: 0 });
  });

  test("a second user cannot take the same username (case-insensitive)", async () => {
    await signUp("alice");
    const bobDb = dbFor("bob");
    const error = await caught(
      setupAccount(bobDb, { uid: "bob", email: "bob@example.com", displayName: "Bob", username: "ALICE", existing: null, hasLists: false }),
    );
    expect(error).toBeInstanceOf(UsernameTakenError);
    expect((await getDoc(refs.profile(bobDb, "bob"))).exists()).toBe(false);
    expect((await getDoc(refs.user(bobDb, "bob"))).exists()).toBe(false);
    expect(await adminGet("usernames/alice")).toMatchObject({ uid: "alice" });
  });

  test("setupAccountWithGeneratedUsername falls back to another username when taken", async () => {
    await signUp("alice");
    const bobDb = dbFor("bob");
    const profile = await setupAccountWithGeneratedUsername(bobDb, {
      uid: "bob",
      email: "bob@example.com",
      displayName: "Alice",
      existing: null,
      hasLists: false,
      preferredUsername: "alice",
    });
    expect(profile.username).toMatch(/^alice\d{4}$/);
    expect(await adminGet(`usernames/${profile.usernameLower}`)).toMatchObject({ uid: "bob" });
    expect(await adminGet("usernames/alice")).toMatchObject({ uid: "alice" });
    expect(toProfile(await getDoc(refs.profile(bobDb, "bob")))?.username).toBe(profile.username);

    // Without a collision the derived name is used as is.
    const carol = await setupAccountWithGeneratedUsername(dbFor("carol"), {
      uid: "carol",
      email: "carol@example.com",
      displayName: "Carol Danvers",
      existing: null,
      hasLists: false,
    });
    expect(carol.username).toBe("Carol_Danvers");
  });

  test("legacy v1 migration imports the watchlist privately and leaves legacy fields untouched", async () => {
    const legacyWatchlist = [
      { id: 603, title: "The Matrix", poster_path: "/x.jpg", release_date: "1999-03-30", genre_ids: [28, 878], vote_average: 8.2 },
      { id: 603, title: "The Matrix", poster_path: "/x.jpg", release_date: "1999-03-30", genre_ids: [28, 878], vote_average: 8.2 },
      { garbage: true },
      { id: 550 },
      null,
      "not a movie",
    ];
    const legacy = { name: "Alice", watchlist: legacyWatchlist, friends: [{ id: "bob", name: "Bob" }] };
    await adminSet("users/alice", legacy);

    const db = dbFor("alice");
    const existing = toUserDoc(await getDoc(refs.user(db, "alice")));
    expect(existing?.schemaVersion).toBe(1);
    const profile = await setupAccount(db, {
      uid: "alice",
      email: "alice@example.com",
      displayName: "Alice",
      username: "alice",
      existing,
      hasLists: false,
    });

    const raw = (await getDoc(refs.user(db, "alice"))).data()!;
    expect(raw.name).toBe(legacy.name);
    expect(raw.watchlist).toEqual(legacy.watchlist);
    expect(raw.friends).toEqual(legacy.friends);
    expect(raw.schemaVersion).toBe(2);
    expect(raw.migratedAt).toBeInstanceOf(Timestamp);
    expect(raw.privacy).toEqual(DEFAULT_PRIVACY);

    const state = await loadState(db, "alice");
    expect(state.lists).toHaveLength(1);
    const [list] = state.lists;
    expect(list).toMatchObject({ name: "Watchlist", visibility: "private", description: "Imported from your previous watchlist." });
    expect(await adminIds("users/alice/library")).toEqual(["603"]);
    expect(state.library).toHaveLength(1);
    expect(state.library[0]).toMatchObject({
      movieId: 603,
      title: "The Matrix",
      posterPath: "/x.jpg",
      releaseDate: "1999-03-30",
      year: 1999,
      genreIds: [28, 878],
      voteAverage: 8.2,
      listIds: [list.id],
      watched: false,
      rating: null,
    });

    // Imported data stays private until the user shares it.
    const shared = await expectSharedIndexInSync({ uid: "alice", db, profile });
    expect(shared.movies).toEqual({});
    expect(shared.lists).toEqual({});
  });

  test("a large legacy watchlist (> 400 movies) is imported across several batches", async () => {
    const watchlist = Array.from({ length: 905 }, (_, i) => ({
      id: i + 1,
      title: `Movie ${i + 1}`,
      poster_path: `/${i + 1}.jpg`,
      release_date: "2001-01-01",
      genre_ids: [18],
      vote_average: 6.5,
    }));
    await adminSet("users/alice", { name: "Alice", watchlist });
    const db = dbFor("alice");
    const existing = toUserDoc(await getDoc(refs.user(db, "alice")));
    const profile = await setupAccount(db, { uid: "alice", email: null, displayName: "Alice", username: "alice", existing, hasLists: false });
    expect((await getDocs(refs.library(db, "alice"))).size).toBe(905);
    expect(toUserDoc(await getDoc(refs.user(db, "alice")))).toMatchObject({ email: null, schemaVersion: SCHEMA_VERSION });
    const shared = await expectSharedIndexInSync({ uid: "alice", db, profile });
    expect(shared.movies).toEqual({});
  });

  test("non-ASCII text up to the app's length limits passes the rules (CJK, emoji)", async () => {
    const displayName = "山田".repeat(20); // 40 chars, 120 UTF-8 bytes
    const yamada = await signUp("yamada", { displayName });
    expect(toProfile(await getDoc(refs.profile(yamada.db, "yamada")))?.displayName).toBe(displayName);

    const emojiName = "😀".repeat(20); // 40 UTF-16 code units, 80 UTF-8 bytes
    const bio = `${"日本語".repeat(53)}あ`; // 160 chars
    await updateProfile(yamada.db, yamada.profile, { displayName: emojiName, bio });
    expect(toProfile(await getDoc(refs.profile(yamada.db, "yamada")))).toMatchObject({ displayName: emojiName, bio });

    const listName = "映画".repeat(30); // 60 chars
    const listId = await withState(yamada, (s) =>
      createList(yamada.db, "yamada", s, { name: listName, description: "説明".repeat(140), visibility: "friends" }),
    );
    await withState(yamada, (s) => setMovieLists(yamada.db, "yamada", s, movie(129, "千と千尋の神隠し".repeat(37), 2001), [listId]));
    const shared = await expectSharedIndexInSync(yamada);
    expect(shared.lists[listId]).toMatchObject({ n: listName, c: 1 });
  });
});

describe("lists", () => {
  test("createList / updateList / deleteList keep the shared index in sync with list visibility", async () => {
    const alice = await signUp("alice");
    const { db, uid } = alice;
    const watchlistId = (await loadState(db, uid)).lists[0].id;

    // A private list never shows up in the shared index.
    const secretId = await withState(alice, (s) => createList(db, uid, s, { name: "Secret", visibility: "private" }));
    let shared = await expectSharedIndexInSync(alice);
    expect(Object.keys(shared.lists)).toEqual([watchlistId]);

    // A friends list does.
    const favesId = await withState(alice, (s) =>
      createList(db, uid, s, { name: "Faves", description: "All-time favourites", visibility: "friends" }),
    );
    shared = await expectSharedIndexInSync(alice);
    expect(Object.keys(shared.lists).sort()).toEqual([watchlistId, favesId].sort());
    expect(shared.lists[favesId]).toMatchObject({ n: "Faves", d: "All-time favourites", c: 0 });

    await withState(alice, (s) => setMovieLists(db, uid, s, matrix, [watchlistId, secretId]));
    await withState(alice, (s) => setMovieLists(db, uid, s, alien, [secretId]));
    await withState(alice, (s) => setMovieLists(db, uid, s, heat, [secretId]));
    await withState(alice, (s) => setWatched(db, uid, s, heat, true));
    await withState(alice, (s) => setMovieLists(db, uid, s, up, [secretId]));
    await withState(alice, (s) => setRating(db, uid, s, up, 4));
    await withState(alice, (s) => setMovieLists(db, uid, s, jaws, [favesId]));

    shared = await expectSharedIndexInSync(alice);
    expect(shared.movies).toEqual({
      [matrix.movieId]: sharedMovie(matrix, [watchlistId]),
      [heat.movieId]: sharedMovie(heat, [], { w: true }),
      [up.movieId]: sharedMovie(up, [], { r: 4 }),
      [jaws.movieId]: sharedMovie(jaws, [favesId]),
    });
    expect(shared.lists[watchlistId].c).toBe(1);
    expect(shared.lists[favesId].c).toBe(1);
    expect(JSON.stringify(shared)).not.toContain(secretId);
    expect(JSON.stringify(shared)).not.toContain("Secret");
    expect(JSON.stringify(shared)).not.toContain("Alien");

    // Rename + make it friends-visible: it and its movies appear.
    await withState(alice, (s) => updateList(db, uid, s, secretId, { name: "Top Secret", visibility: "friends" }));
    let state = await loadState(db, uid);
    expect(state.lists.find((l) => l.id === secretId)).toMatchObject({ name: "Top Secret", visibility: "friends" });
    shared = await expectSharedIndexInSync(alice);
    expect(shared.lists[secretId]).toMatchObject({ n: "Top Secret", d: "", c: 4 });
    expect(shared.movies[alien.movieId]).toEqual(sharedMovie(alien, [secretId]));
    expect(shared.movies[matrix.movieId].l).toEqual([watchlistId, secretId].sort());

    // Make another list private: it and its movies disappear.
    await withState(alice, (s) => updateList(db, uid, s, favesId, { name: "Faves", description: "All-time favourites", visibility: "private" }));
    shared = await expectSharedIndexInSync(alice);
    expect(shared.lists[favesId]).toBeUndefined();
    expect(shared.movies[jaws.movieId]).toBeUndefined();

    // Delete the (friends-visible) Top Secret list.
    await withState(alice, (s) => deleteList(db, uid, s, secretId));
    state = await loadState(db, uid);
    expect(state.lists.map((l) => l.id).sort()).toEqual([watchlistId, favesId].sort());
    expect(entryOf(state, alien)).toBeUndefined(); // only in the deleted list
    expect(entryOf(state, matrix)?.listIds).toEqual([watchlistId]); // keeps its other list
    expect(entryOf(state, heat)).toMatchObject({ listIds: [], watched: true }); // watched: kept
    expect(entryOf(state, up)).toMatchObject({ listIds: [], rating: 4 }); // rated: kept
    expect(entryOf(state, jaws)?.listIds).toEqual([favesId]);

    shared = await expectSharedIndexInSync(alice);
    expect(shared.lists).toEqual({ [watchlistId]: expect.objectContaining({ n: "Watchlist", c: 1 }) });
    expect(shared.movies).toEqual({
      [matrix.movieId]: sharedMovie(matrix, [watchlistId]),
      [heat.movieId]: sharedMovie(heat, [], { w: true }),
      [up.movieId]: sharedMovie(up, [], { r: 4 }),
    });
    expect(JSON.stringify(shared)).not.toContain(secretId);

    const types = await activityTypes(alice);
    expect(types.filter((t) => t === "list_created")).toHaveLength(2);
    expect(types.filter((t) => t === "list_updated")).toHaveLength(2);
    expect(types.filter((t) => t === "list_deleted")).toHaveLength(1);
  });

  test("deleteList processes a list with more than 450 movies in chunks", async () => {
    const alice = await signUp("alice");
    const { db, uid } = alice;
    const watchlistId = (await loadState(db, uid)).lists[0].id;
    const bigId = await withState(alice, (s) => createList(db, uid, s, { name: "Big", visibility: "friends" }));
    // Seed 460 entries directly: odd ids only in Big, even ids also in Watchlist.
    await asAdmin(async (adminDb) => {
      const batch = writeBatch(adminDb);
      for (let id = 1; id <= 460; id++) {
        batch.set(doc(adminDb, `users/alice/library/${id}`), {
          movieId: id,
          title: `Movie ${id}`,
          posterPath: null,
          releaseDate: null,
          year: null,
          genreIds: [],
          voteAverage: 0,
          originalLanguage: null,
          listIds: id % 2 ? [bigId] : [bigId, watchlistId],
          watched: false,
          watchedAt: null,
          rating: null,
          ratedAt: null,
          addedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }
      await batch.commit();
    });
    await withState(alice, (s) => syncSharedIndex(db, uid, s));

    await withState(alice, (s) => deleteList(db, uid, s, bigId));

    const state = await loadState(db, uid);
    expect(state.lists.map((l) => l.id)).toEqual([watchlistId]);
    expect(state.library).toHaveLength(230);
    expect(state.library.every((e) => e.movieId % 2 === 0 && e.listIds.join() === watchlistId)).toBe(true);
    const shared = await expectSharedIndexInSync(alice);
    expect(shared.lists).toEqual({ [watchlistId]: expect.objectContaining({ c: 230 }) });
    expect(Object.keys(shared.movies)).toHaveLength(230);
  });

  test("createList with a movie bumps and logs the other lists the movie joins or leaves", async () => {
    const alice = await signUp("alice");
    const { db, uid } = alice;
    const watchlistId = (await loadState(db, uid)).lists[0].id;
    const privateId = await withState(alice, (s) => createList(db, uid, s, { name: "Private", visibility: "private" }));
    const favesId = await withState(alice, (s) => createList(db, uid, s, { name: "Faves", visibility: "friends" }));
    await withState(alice, (s) => setMovieLists(db, uid, s, matrix, [watchlistId, privateId]));
    await clearActivity(db, uid);
    const before = await loadState(db, uid);

    // Keep Watchlist, join Faves, leave Private, and add to the new list.
    const scifiId = await createList(db, uid, before, { name: "Sci-fi", visibility: "friends" }, { movie: matrix, listIds: [watchlistId, favesId] });

    const after = await loadState(db, uid);
    const listOf = (state: LibraryState, id: string) => state.lists.find((l) => l.id === id)!;
    const now = listOf(after, scifiId).createdAt!;
    expect(entryOf(after, matrix)?.listIds).toEqual([watchlistId, favesId, scifiId]);
    // Lists the movie joined or left get the batch's timestamp; Watchlist is untouched.
    expect(listOf(after, favesId).updatedAt!.isEqual(now)).toBe(true);
    expect(listOf(after, privateId).updatedAt!.isEqual(now)).toBe(true);
    expect(listOf(after, watchlistId).updatedAt!.isEqual(listOf(before, watchlistId).updatedAt!)).toBe(true);

    const activity = (await getDocs(refs.activity(db, uid))).docs.map(toActivity).filter(present);
    expect(activity.map((a) => `${a.type} ${a.listName}`).sort()).toEqual(["added Faves", "added Sci-fi", "list_created Sci-fi", "removed Private"]);
    expect(activity.filter((a) => a.type !== "list_created").every((a) => a.movieId === matrix.movieId && a.title === matrix.title)).toBe(true);

    const shared = await expectSharedIndexInSync(alice);
    expect(shared.movies[matrix.movieId]).toEqual(sharedMovie(matrix, [watchlistId, favesId, scifiId]));
    expect(shared.lists[favesId]).toMatchObject({ c: 1, u: now.toMillis() });
    expect(JSON.stringify(shared)).not.toContain(privateId);
  });

  test("createList with a movie (5-arg form) creates the list and adds the movie in one batch", async () => {
    const alice = await signUp("alice");
    const { db, uid } = alice;
    const watchlistId = (await loadState(db, uid)).lists[0].id;
    const privateId = await withState(alice, (s) => createList(db, uid, s, { name: "Private", visibility: "private" }));
    await withState(alice, (s) => setMovieLists(db, uid, s, matrix, [watchlistId, privateId]));
    await withState(alice, (s) => setRating(db, uid, s, matrix, 5));

    const scifiId = await withState(alice, (s) =>
      createList(db, uid, s, { name: "Sci-fi", visibility: "friends" }, { movie: matrix, listIds: [watchlistId, privateId, "no-such-list"] }),
    );

    let state = await loadState(db, uid);
    expect(state.lists.find((l) => l.id === scifiId)).toMatchObject({ name: "Sci-fi", visibility: "friends" });
    // The given (known) list ids are kept, the new list is added, the rating survives.
    expect(entryOf(state, matrix)).toMatchObject({ listIds: [watchlistId, privateId, scifiId], rating: 5 });

    let shared = await expectSharedIndexInSync(alice);
    expect(shared.lists[scifiId]).toMatchObject({ n: "Sci-fi", d: "", c: 1 });
    expect(shared.lists[watchlistId]).toMatchObject({ c: 1 });
    expect(shared.movies[matrix.movieId]).toEqual(sharedMovie(matrix, [watchlistId, scifiId], { r: 5 }));
    expect(JSON.stringify(shared)).not.toContain(privateId);

    // A movie that is not in the library yet.
    const docsId = await withState(alice, (s) =>
      createList(db, uid, s, { name: "Classics", visibility: "friends" }, { movie: alien, listIds: [] }),
    );
    state = await loadState(db, uid);
    expect(entryOf(state, alien)).toMatchObject({ listIds: [docsId], watched: false, rating: null });
    shared = await expectSharedIndexInSync(alice);
    expect(shared.movies[alien.movieId]).toEqual(sharedMovie(alien, [docsId]));
    expect(shared.lists[docsId]).toMatchObject({ n: "Classics", c: 1 });

    const activity = (await getDocs(refs.activity(db, uid))).docs.map(toActivity).filter(present);
    expect(activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "list_created", listId: scifiId, listName: "Sci-fi" }),
        expect.objectContaining({ type: "added", listId: scifiId, listName: "Sci-fi", movieId: matrix.movieId, title: matrix.title }),
        expect.objectContaining({ type: "added", listId: docsId, movieId: alien.movieId }),
      ]),
    );
  });
});

describe("movies", () => {
  test("setMovieLists adds and removes; an entry with no lists, watched or rating is deleted", async () => {
    const alice = await signUp("alice");
    const { db, uid } = alice;
    const watchlistId = (await loadState(db, uid)).lists[0].id;
    const favesId = await withState(alice, (s) => createList(db, uid, s, { name: "Faves", visibility: "friends" }));

    await withState(alice, (s) => setMovieLists(db, uid, s, matrix, [watchlistId]));
    let state = await loadState(db, uid);
    expect(entryOf(state, matrix)).toMatchObject({ ...matrix, listIds: [watchlistId], watched: false, rating: null });
    expect(entryOf(state, matrix)?.addedAt).toBeInstanceOf(Timestamp);
    let shared = await expectSharedIndexInSync(alice);
    expect(shared.movies[matrix.movieId]).toEqual(sharedMovie(matrix, [watchlistId]));

    await withState(alice, (s) => setMovieLists(db, uid, s, matrix, [watchlistId, favesId]));
    state = await loadState(db, uid);
    expect(entryOf(state, matrix)?.listIds).toEqual([watchlistId, favesId]);
    shared = await expectSharedIndexInSync(alice);
    expect(shared.movies[matrix.movieId].l).toEqual([watchlistId, favesId].sort());
    expect(shared.lists[favesId].c).toBe(1);

    await withState(alice, (s) => setMovieLists(db, uid, s, matrix, [favesId]));
    state = await loadState(db, uid);
    expect(entryOf(state, matrix)?.listIds).toEqual([favesId]);
    shared = await expectSharedIndexInSync(alice);
    expect(shared.lists[watchlistId].c).toBe(0);

    await withState(alice, (s) => setMovieLists(db, uid, s, matrix, []));
    expect((await getDoc(refs.libraryEntry(db, uid, matrix.movieId))).exists()).toBe(false);
    shared = await expectSharedIndexInSync(alice);
    expect(shared.movies).toEqual({});

    // Unknown list ids are ignored (no-op, nothing written).
    await withState(alice, (s) => setMovieLists(db, uid, s, matrix, ["no-such-list"]));
    expect((await getDoc(refs.libraryEntry(db, uid, matrix.movieId))).exists()).toBe(false);

    const types = await activityTypes(alice);
    expect(types.filter((t) => t === "added")).toHaveLength(2);
    expect(types.filter((t) => t === "removed")).toHaveLength(2);
  });

  test("setWatched and setRating (including rating = null) write valid entries", async () => {
    const alice = await signUp("alice");
    const { db, uid } = alice;
    const watchlistId = (await loadState(db, uid)).lists[0].id;

    await withState(alice, (s) => setWatched(db, uid, s, alien, true));
    let state = await loadState(db, uid);
    expect(entryOf(state, alien)).toMatchObject({ listIds: [], watched: true });
    expect(entryOf(state, alien)?.watchedAt).toBeInstanceOf(Timestamp);
    let shared = await expectSharedIndexInSync(alice);
    expect(shared.movies[alien.movieId]).toEqual(sharedMovie(alien, [], { w: true }));

    await withState(alice, (s) => setWatched(db, uid, s, alien, false));
    expect((await getDoc(refs.libraryEntry(db, uid, alien.movieId))).exists()).toBe(false);
    await expectSharedIndexInSync(alice);

    await withState(alice, (s) => setMovieLists(db, uid, s, heat, [watchlistId]));
    await withState(alice, (s) => setRating(db, uid, s, heat, 4));
    state = await loadState(db, uid);
    expect(entryOf(state, heat)).toMatchObject({ listIds: [watchlistId], rating: 4 });
    expect(entryOf(state, heat)?.ratedAt).toBeInstanceOf(Timestamp);
    shared = await expectSharedIndexInSync(alice);
    expect(shared.movies[heat.movieId]).toEqual(sharedMovie(heat, [watchlistId], { r: 4 }));

    await withState(alice, (s) => setRating(db, uid, s, heat, null));
    state = await loadState(db, uid);
    expect(entryOf(state, heat)).toMatchObject({ listIds: [watchlistId], rating: null, ratedAt: null });
    shared = await expectSharedIndexInSync(alice);
    expect(shared.movies[heat.movieId]).toEqual(sharedMovie(heat, [watchlistId]));

    await withState(alice, (s) => setRating(db, uid, s, up, 5));
    shared = await expectSharedIndexInSync(alice);
    expect(shared.movies[up.movieId]).toEqual(sharedMovie(up, [], { r: 5 }));
    await withState(alice, (s) => setRating(db, uid, s, up, null));
    expect((await getDoc(refs.libraryEntry(db, uid, up.movieId))).exists()).toBe(false);
    await expectSharedIndexInSync(alice);

    expect(await caught(withState(alice, (s) => setRating(db, uid, s, up, 6)))).toBeInstanceOf(LibraryError);

    const activity = (await getDocs(refs.activity(db, uid))).docs.map(toActivity).filter(present);
    expect(activity).toEqual(expect.arrayContaining([expect.objectContaining({ type: "rated", movieId: heat.movieId, rating: 4 })]));
    expect(await activityTypes(alice)).toEqual(
      expect.arrayContaining<ActivityType>(["watched", "unwatched", "rated", "unrated", "added"]),
    );

    await clearActivity(db, uid);
    expect(await activityTypes(alice)).toEqual([]);
  });

  test("with privacy.shareRatings = false the shared index has no ratings (shareWatched = false hides watched)", async () => {
    const alice = await signUp("alice");
    const { db, uid } = alice;
    const watchlistId = (await loadState(db, uid)).lists[0].id;
    await withState(alice, (s) => setMovieLists(db, uid, s, heat, [watchlistId]));
    await withState(alice, (s) => setRating(db, uid, s, heat, 3));
    await withState(alice, (s) => setWatched(db, uid, s, heat, true));
    await withState(alice, (s) => setRating(db, uid, s, up, 5)); // rated only
    await withState(alice, (s) => setWatched(db, uid, s, alien, true)); // watched only

    let shared = await expectSharedIndexInSync(alice);
    expect(shared.movies).toEqual({
      [heat.movieId]: sharedMovie(heat, [watchlistId], { w: true, r: 3 }),
      [up.movieId]: sharedMovie(up, [], { r: 5 }),
      [alien.movieId]: sharedMovie(alien, [], { w: true }),
    });

    await updatePrivacy(db, uid, { shareWatched: true, shareRatings: false });
    let state = await loadState(db, uid);
    expect(state.privacy).toEqual({ shareWatched: true, shareRatings: false });
    await syncSharedIndex(db, uid, state);
    shared = await expectSharedIndexInSync(alice);
    expect(Object.values(shared.movies).filter((m) => "r" in m)).toEqual([]);
    expect(shared.movies).toEqual({
      [heat.movieId]: sharedMovie(heat, [watchlistId], { w: true }),
      [alien.movieId]: sharedMovie(alien, [], { w: true }),
    });

    // Later mutations respect the setting too.
    await withState(alice, (s) => setRating(db, uid, s, heat, 5));
    shared = await expectSharedIndexInSync(alice);
    expect(Object.values(shared.movies).filter((m) => "r" in m)).toEqual([]);

    await updatePrivacy(db, uid, { shareWatched: false, shareRatings: false });
    state = await loadState(db, uid);
    await syncSharedIndex(db, uid, state);
    shared = await expectSharedIndexInSync(alice);
    expect(shared.movies).toEqual({ [heat.movieId]: sharedMovie(heat, [watchlistId]) });
  });
});

describe("profile edits", () => {
  test("updateProfile edits fields and moves the username claim", async () => {
    const alice = await signUp("alice", { displayName: "Alice" });
    const { db } = alice;
    await updateProfile(db, alice.profile, {
      displayName: "  Alice  Liddell ",
      bio: "Film nerd.\n\n\n\nHi",
      avatarColor: AVATAR_COLORS[2],
      discoverable: false,
      allowFriendRequests: false,
    });
    let profile = toProfile(await getDoc(refs.profile(db, "alice")))!;
    expect(profile).toMatchObject({
      displayName: "Alice Liddell",
      displayNameLower: "alice liddell",
      bio: "Film nerd.\n\nHi",
      avatarColor: AVATAR_COLORS[2],
      discoverable: false,
      allowFriendRequests: false,
      username: "alice",
    });

    await updateProfile(db, profile, { username: "Alice_W" });
    profile = toProfile(await getDoc(refs.profile(db, "alice")))!;
    expect(profile).toMatchObject({ username: "Alice_W", usernameLower: "alice_w" });
    expect(await adminGet("usernames/alice_w")).toMatchObject({ uid: "alice" });
    expect(await adminGet("usernames/alice")).toBeUndefined();

    // The released name can be taken by someone else, and is then unavailable to alice.
    await signUp("bob", { username: "alice" });
    expect(await caught(updateProfile(db, profile, { username: "ALICE" }))).toBeInstanceOf(UsernameTakenError);

    // A case-only change keeps the same claim.
    await updateProfile(db, profile, { username: "alice_W" });
    expect(toProfile(await getDoc(refs.profile(db, "alice")))).toMatchObject({ username: "alice_W", usernameLower: "alice_w" });
    expect(await adminGet("usernames/alice_w")).toMatchObject({ uid: "alice" });
  });

  test("updatePreferences stores sanitized preferences", async () => {
    const alice = await signUp("alice");
    await updatePreferences(alice.db, "alice", {
      favoriteGenres: [28, 28, 12, 1.5, 16, 35, 80, 99, 18, 10751, 14, 36, 27],
      preferredLanguage: "en",
    });
    expect(toUserDoc(await getDoc(refs.user(alice.db, "alice")))?.preferences).toEqual({
      favoriteGenres: [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36],
      preferredLanguage: "en",
    });
    await updatePreferences(alice.db, "alice", { favoriteGenres: [], preferredLanguage: "English" });
    expect(toUserDoc(await getDoc(refs.user(alice.db, "alice")))?.preferences).toEqual({ favoriteGenres: [], preferredLanguage: null });
  });
});

describe("friends", () => {
  test("send, duplicate send, and auto-accept when the other user sends back", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");

    await expect(sendFriendRequest(alice.db, "alice", "bob")).resolves.toBe("sent");
    const request = toFriendRequest(await getDoc(refs.friendRequest(bob.db, "alice_bob")));
    expect(request).toMatchObject({ from: "alice", to: "bob" });
    expect(request!.createdAt).toBeInstanceOf(Timestamp);
    const incoming = await getDocs(query(refs.friendRequests(bob.db), where("to", "==", "bob")));
    expect(incoming.docs.map((d) => d.id)).toEqual(["alice_bob"]);
    const outgoing = await getDocs(query(refs.friendRequests(alice.db), where("from", "==", "alice")));
    expect(outgoing.docs.map((d) => d.id)).toEqual(["alice_bob"]);

    const duplicate = await caught(sendFriendRequest(alice.db, "alice", "bob"));
    expect(duplicate).toBeInstanceOf(FriendError);
    expect(duplicate.message).toMatch(/already sent/);
    expect(await caught(sendFriendRequest(alice.db, "alice", "alice"))).toBeInstanceOf(FriendError);

    await expect(sendFriendRequest(bob.db, "bob", "alice")).resolves.toBe("accepted");
    expect(toFriendship(await getDoc(refs.friendship(alice.db, "alice_bob")))).toMatchObject({
      members: ["alice", "bob"],
      requestedBy: "alice",
    });
    expect(await adminIds("friendRequests")).toEqual([]);
    expect(await activityTypes(bob)).toContain("friend_added");
    for (const account of [alice, bob]) {
      const mine = await getDocs(query(refs.friendships(account.db), where("members", "array-contains", account.uid)));
      expect(mine.docs.map((d) => d.id)).toEqual(["alice_bob"]);
    }

    const again = await caught(sendFriendRequest(alice.db, "alice", "bob"));
    expect(again).toBeInstanceOf(FriendError);
    expect(again.message).toMatch(/already friends/);
  });

  test("after acceptFriendRequest a friend reads only the shared index; removeFriend revokes it", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");
    const watchlistId = (await loadState(alice.db, "alice")).lists[0].id;
    const privateId = await withState(alice, (s) => createList(alice.db, "alice", s, { name: "Guilty pleasures", visibility: "private" }));
    await withState(alice, (s) => setMovieLists(alice.db, "alice", s, matrix, [watchlistId]));
    await withState(alice, (s) => setMovieLists(alice.db, "alice", s, alien, [privateId]));

    await sendFriendRequest(alice.db, "alice", "bob");
    await assertFails(getDoc(refs.sharedIndex(bob.db, "alice"))); // a pending request is not a friendship
    await acceptFriendRequest(bob.db, "bob", "alice");
    expect(await adminIds("friendRequests")).toEqual([]);

    const shared = toSharedIndex(await assertSucceeds(getDoc(refs.sharedIndex(bob.db, "alice"))));
    expect(Object.keys(shared!.lists)).toEqual([watchlistId]);
    expect(shared!.movies).toEqual({ [matrix.movieId]: sharedMovie(matrix, [watchlistId]) });
    expect(JSON.stringify(shared)).not.toContain("Guilty pleasures");
    expect(JSON.stringify(shared)).not.toContain(privateId);
    await assertSucceeds(getDoc(refs.sharedIndex(alice.db, "bob"))); // works both ways

    // Everything else stays private, even to a friend.
    await assertFails(getDocs(refs.library(bob.db, "alice")));
    await assertFails(getDoc(refs.libraryEntry(bob.db, "alice", matrix.movieId)));
    await assertFails(getDocs(refs.watchlists(bob.db, "alice")));
    await assertFails(getDoc(refs.watchlist(bob.db, "alice", watchlistId)));
    await assertFails(getDocs(refs.activity(bob.db, "alice")));
    await assertFails(getDoc(refs.user(bob.db, "alice")));

    await removeFriend(alice.db, "alice", "bob");
    expect(await adminIds("friendships")).toEqual([]);
    await assertFails(getDoc(refs.sharedIndex(bob.db, "alice")));
    await assertFails(getDoc(refs.sharedIndex(alice.db, "bob")));
  });

  test("acceptFriendRequest also removes the accepter's own crossing request", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");
    await sendFriendRequest(alice.db, "alice", "bob");
    // Requests that crossed in flight (the rules reject the second one, so seed it).
    await adminSet("friendRequests/bob_alice", { from: "bob", to: "alice", createdAt: Timestamp.now() });
    await acceptFriendRequest(bob.db, "bob", "alice");
    expect(await adminIds("friendRequests")).toEqual([]);
    expect(await adminIds("friendships")).toEqual(["alice_bob"]);
  });

  test("declineFriendRequest and cancelFriendRequest delete the pending request", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");
    await sendFriendRequest(alice.db, "alice", "bob");
    await declineFriendRequest(bob.db, "bob", "alice");
    expect(await adminIds("friendRequests")).toEqual([]);

    await expect(sendFriendRequest(alice.db, "alice", "bob")).resolves.toBe("sent");
    await cancelFriendRequest(alice.db, "alice", "bob");
    expect(await adminIds("friendRequests")).toEqual([]);
    expect(await adminIds("friendships")).toEqual([]);
  });

  test("cancel, decline and removeFriend resolve when the doc is already gone", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");

    // alice cancels after bob already accepted: a no-op, the friendship stays.
    await sendFriendRequest(alice.db, "alice", "bob");
    await acceptFriendRequest(bob.db, "bob", "alice");
    await expect(cancelFriendRequest(alice.db, "alice", "bob")).resolves.toBeUndefined();
    expect(await adminIds("friendships")).toEqual(["alice_bob"]);

    // Both remove the friendship (or a double tap).
    await removeFriend(alice.db, "alice", "bob");
    await expect(removeFriend(bob.db, "bob", "alice")).resolves.toBeUndefined();
    await expect(removeFriend(alice.db, "alice", "bob")).resolves.toBeUndefined();
    expect(await adminIds("friendships")).toEqual([]);

    // bob declines after alice already cancelled.
    await sendFriendRequest(alice.db, "alice", "bob");
    await cancelFriendRequest(alice.db, "alice", "bob");
    await expect(declineFriendRequest(bob.db, "bob", "alice")).resolves.toBeUndefined();
    expect(await adminIds("friendRequests")).toEqual([]);
  });

  test("a user who turned off friend requests cannot be sent one", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");
    await updateProfile(bob.db, bob.profile, { allowFriendRequests: false });
    expect(await caught(sendFriendRequest(alice.db, "alice", "bob"))).toBeInstanceOf(FriendError);
    expect(await adminIds("friendRequests")).toEqual([]);
  });
});

describe("searchProfiles", () => {
  test("finds discoverable profiles by username or display-name prefix, excluding the caller", async () => {
    const alice = await signUp("alice", { username: "alice", displayName: "Alice Liddell" });
    await signUp("frank", { username: "AliBaba", displayName: "Frank" });
    await signUp("carol", { username: "carol", displayName: "Alicia Keys" });
    const dave = await signUp("dave", { username: "alistair", displayName: "Dave" });
    await updateProfile(dave.db, dave.profile, { discoverable: false });
    const bob = await signUp("bob", { username: "bob", displayName: "Bob" });

    // Username matches first, then display-name matches; case-insensitive; "@" ignored.
    expect((await searchProfiles(alice.db, "@ALI", "alice")).map((p) => p.uid)).toEqual(["frank", "carol"]);
    expect((await searchProfiles(bob.db, "ali", "bob")).map((p) => p.uid)).toEqual(["alice", "frank", "carol"]);
    expect((await searchProfiles(bob.db, "ALICIA", "bob")).map((p) => p.uid)).toEqual(["carol"]);
    // dave is not discoverable.
    expect(await searchProfiles(bob.db, "alis", "bob")).toEqual([]);
    expect(await searchProfiles(bob.db, "dave", "bob")).toEqual([]);
    expect(await searchProfiles(bob.db, "a", "bob")).toEqual([]);
    expect(await searchProfiles(bob.db, "zz", "bob")).toEqual([]);
  });
});

describe("deleteUserData", () => {
  /** alice with lists, library, activity, a friendship and pending requests, plus other users' data that must survive. */
  async function setUpAlice(): Promise<Account> {
    const alice = await signUp("alice");
    const bob = await signUp("bob");
    const carol = await signUp("carol");
    const dave = await signUp("dave");
    const watchlistId = (await loadState(alice.db, "alice")).lists[0].id;
    await withState(alice, (s) => createList(alice.db, "alice", s, { name: "Secret", visibility: "private" }));
    await withState(alice, (s) => setMovieLists(alice.db, "alice", s, matrix, [watchlistId]));
    await withState(alice, (s) => setRating(alice.db, "alice", s, heat, 4));
    await sendFriendRequest(alice.db, "alice", "bob");
    await acceptFriendRequest(bob.db, "bob", "alice"); // friendship alice_bob
    await sendFriendRequest(alice.db, "alice", "carol"); // outgoing, pending
    await sendFriendRequest(dave.db, "dave", "alice"); // incoming, pending
    await sendFriendRequest(carol.db, "carol", "bob");
    await acceptFriendRequest(bob.db, "bob", "carol"); // not alice's: must survive
    await sendFriendRequest(dave.db, "dave", "carol"); // not alice's: must survive
    return alice;
  }

  async function expectNothingLeftOfAlice() {
    expect(await adminGet("profiles/alice")).toBeUndefined();
    expect(await adminGet("users/alice")).toBeUndefined();
    for (const sub of ["watchlists", "library", "activity", "shared"]) {
      expect(await adminIds(`users/alice/${sub}`)).toEqual([]);
    }
    const claims = await asAdmin(async (db) => (await getDocs(query(collection(db, "usernames"), where("uid", "==", "alice")))).size);
    expect(claims).toBe(0);
    const involvesAlice = (id: string) => id.split("_").includes("alice");
    expect((await adminIds("friendships")).filter(involvesAlice)).toEqual([]);
    expect((await adminIds("friendRequests")).filter(involvesAlice)).toEqual([]);
  }

  async function expectOthersIntact() {
    expect(await adminIds("friendships")).toEqual(["bob_carol"]);
    expect(await adminIds("friendRequests")).toEqual(["dave_carol"]);
    expect(await adminIds("profiles")).toEqual(["bob", "carol", "dave"]);
    expect(await adminIds("users/bob/watchlists")).toHaveLength(1);
  }

  test("removes all of a user's docs, including username claim, profile, friendships and requests", async () => {
    const alice = await setUpAlice();
    await deleteUserData(alice.db, "alice", alice.profile.usernameLower);
    await expectNothingLeftOfAlice();
    await expectOthersIntact();
    // The username is free again.
    await expect(signUp("erin", { username: "alice" })).resolves.toMatchObject({ profile: expect.objectContaining({ usernameLower: "alice" }) });
  });

  // Partial states are produced through alice's own client, i.e. states the rules allow.
  test.each<[string, (alice: Account) => Promise<unknown>]>([
    ["the profile is already gone", ({ db }) => deleteDoc(refs.profile(db, "alice"))],
    [
      "the username claim is already released",
      async ({ db }) => {
        await deleteDoc(refs.profile(db, "alice"));
        await deleteDoc(refs.username(db, "alice"));
      },
    ],
    ["only the username claim is left", ({ db }) => deleteUserData(db, "alice", null)],
  ])("a retry after a partial run (%s) succeeds and leaves nothing behind", async (_label, partialRun) => {
    const alice = await setUpAlice();
    await partialRun(alice);
    await expect(deleteUserData(alice.db, "alice", "alice")).resolves.toBeUndefined();
    await expectNothingLeftOfAlice();
    await expectOthersIntact();
    expect(await adminGet("usernames/alice")).toBeUndefined();
  });

  test("a retry after a complete run is a no-op and never touches a claim someone else took since", async () => {
    const alice = await setUpAlice();
    await deleteUserData(alice.db, "alice", "alice");
    await expect(deleteUserData(alice.db, "alice", "alice")).resolves.toBeUndefined();
    await signUp("erin", { username: "alice" });
    await expect(deleteUserData(alice.db, "alice", "alice")).resolves.toBeUndefined();
    expect(await adminGet("usernames/alice")).toMatchObject({ uid: "erin" });
    expect(await adminGet("profiles/erin")).toMatchObject({ usernameLower: "alice" });
    await expectNothingLeftOfAlice();
  });
});
