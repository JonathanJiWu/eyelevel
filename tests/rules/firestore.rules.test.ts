/**
 * Raw allow/deny tests for firestore.rules (schema v2).
 *
 * Needs the Firestore emulator: run with `npm run test:rules`.
 * Fixtures are written with security rules disabled; every assertion runs
 * through the rules as a specific (or no) signed-in user.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  setLogLevel,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

jest.setTimeout(30_000);
// Denied writes are expected here; keep the SDK from logging each one.
setLogLevel("error");

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
});

// ---------------------------------------------------------------- helpers

const modular = (ctx: RulesTestContext) => ctx.firestore() as unknown as Firestore;

/** Firestore client signed in as `uid` (one client per uid per test). */
function userDb(uid: string): Firestore {
  let db = clients.get(uid);
  if (!db) {
    db = modular(testEnv.authenticatedContext(uid));
    clients.set(uid, db);
  }
  return db;
}

const guestDb = () => modular(testEnv.unauthenticatedContext());

async function seed(write: (db: Firestore) => Promise<unknown>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await write(modular(ctx));
  });
}

const seedDoc = (path: string, data: DocumentData) => seed((db) => setDoc(doc(db, path), data));

async function readAsAdmin(path: string): Promise<DocumentData | undefined> {
  let data: DocumentData | undefined;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(modular(ctx), path))).data();
  });
  return data;
}

function without(data: DocumentData, key: string): DocumentData {
  const copy = { ...data };
  delete copy[key];
  return copy;
}

const PAST = Timestamp.fromMillis(Date.UTC(2024, 0, 1));

/** A valid profile (as setupAccount writes it); the username defaults to the uid. */
function profileData(uid: string, overrides: DocumentData = {}): DocumentData {
  return {
    uid,
    displayName: uid.charAt(0).toUpperCase() + uid.slice(1),
    displayNameLower: uid.toLowerCase(),
    username: uid,
    usernameLower: uid.toLowerCase(),
    bio: "",
    avatarColor: "#5C6BC0",
    discoverable: true,
    allowFriendRequests: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

/** profiles/{uid} + usernames/{usernameLower}: a completed account. */
async function seedAccount(uid: string, overrides: DocumentData = {}) {
  const profile = profileData(uid, overrides);
  await seed(async (db) => {
    const batch = writeBatch(db);
    batch.set(doc(db, "profiles", uid), profile);
    batch.set(doc(db, "usernames", String(profile.usernameLower)), { uid, createdAt: PAST });
    await batch.commit();
  });
}

async function seedFriendship(a: string, b: string) {
  const members = [a, b].sort();
  await seedDoc(`friendships/${members[0]}_${members[1]}`, { members, requestedBy: b, createdAt: PAST });
}

const seedRequest = (from: string, to: string) => seedDoc(`friendRequests/${from}_${to}`, { from, to, createdAt: PAST });

/** Username claim + profile in one batch, like setupAccount. */
function claimAndCreateProfile(db: Firestore, uid: string, profile: DocumentData, claimId = String(profile.usernameLower)) {
  const batch = writeBatch(db);
  batch.set(doc(db, "usernames", claimId), { uid, createdAt: serverTimestamp() });
  batch.set(doc(db, "profiles", uid), profile);
  return batch.commit();
}

const userData = (overrides: DocumentData = {}): DocumentData => ({
  email: "alice@example.com",
  privacy: { shareWatched: true, shareRatings: true },
  preferences: { favoriteGenres: [], preferredLanguage: null },
  schemaVersion: 2,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});

const listData = (overrides: DocumentData = {}): DocumentData => ({
  name: "Watchlist",
  description: "",
  visibility: "friends",
  createdAt: PAST,
  updatedAt: PAST,
  ...overrides,
});

const entryData = (movieId: number, overrides: DocumentData = {}): DocumentData => ({
  movieId,
  title: "The Matrix",
  posterPath: "/x.jpg",
  releaseDate: "1999-03-30",
  year: 1999,
  genreIds: [28, 878],
  voteAverage: 8.2,
  originalLanguage: "en",
  listIds: ["list1"],
  watched: false,
  watchedAt: null,
  rating: null,
  ratedAt: null,
  addedAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});

const activityData = (overrides: DocumentData = {}): DocumentData => ({
  type: "added",
  movieId: 603,
  title: "The Matrix",
  listId: "list1",
  listName: "Watchlist",
  rating: null,
  createdAt: serverTimestamp(),
  ...overrides,
});

const sharedIndexData = (overrides: DocumentData = {}): DocumentData => ({
  version: 1,
  movies: { "603": { t: "The Matrix", p: "/x.jpg", y: 1999, g: [28], l: ["list1"] } },
  lists: { list1: { n: "Watchlist", d: "", c: 1, u: 0 } },
  updatedAt: serverTimestamp(),
  ...overrides,
});

// ------------------------------------------------------------------ tests

describe("unauthenticated users", () => {
  beforeEach(async () => {
    await seedAccount("alice");
    await seedAccount("bob");
    await seed(async (db) => {
      const batch = writeBatch(db);
      batch.set(doc(db, "users/alice"), userData());
      batch.set(doc(db, "users/alice/watchlists/list1"), listData());
      batch.set(doc(db, "users/alice/library/603"), entryData(603));
      batch.set(doc(db, "users/alice/activity/act1"), activityData());
      batch.set(doc(db, "users/alice/shared/index"), sharedIndexData());
      batch.set(doc(db, "friendRequests/alice_bob"), { from: "alice", to: "bob", createdAt: PAST });
      batch.set(doc(db, "friendships/alice_carol"), { members: ["alice", "carol"], requestedBy: "carol", createdAt: PAST });
      await batch.commit();
    });
  });

  test("can check username availability with a get on usernames/{name}", async () => {
    const taken = await assertSucceeds(getDoc(doc(guestDb(), "usernames/alice")));
    expect(taken.data()?.uid).toBe("alice");
    const free = await assertSucceeds(getDoc(doc(guestDb(), "usernames/nobody")));
    expect(free.exists()).toBe(false);
  });

  test("cannot list usernames", async () => {
    await assertFails(getDocs(collection(guestDb(), "usernames")));
  });

  test("cannot get or list profiles", async () => {
    await assertFails(getDoc(doc(guestDb(), "profiles/alice")));
    await assertFails(getDocs(collection(guestDb(), "profiles")));
    await assertFails(getDocs(query(collection(guestDb(), "profiles"), where("discoverable", "==", true))));
  });

  test.each([
    "users/alice",
    "users/alice/watchlists/list1",
    "users/alice/library/603",
    "users/alice/activity/act1",
    "users/alice/shared/index",
    "friendRequests/alice_bob",
    "friendships/alice_carol",
  ])("cannot get %s", async (path) => {
    await assertFails(getDoc(doc(guestDb(), path)));
  });

  test("cannot run list queries on private data, requests or friendships", async () => {
    const db = guestDb();
    await assertFails(getDocs(collection(db, "users/alice/watchlists")));
    await assertFails(getDocs(collection(db, "users/alice/library")));
    await assertFails(getDocs(collection(db, "users/alice/activity")));
    await assertFails(getDocs(query(collection(db, "friendRequests"), where("to", "==", "bob"))));
    await assertFails(getDocs(query(collection(db, "friendships"), where("members", "array-contains", "alice"))));
  });

  test("cannot write anything", async () => {
    const db = guestDb();
    await assertFails(claimAndCreateProfile(db, "guest", profileData("guest")));
    await assertFails(setDoc(doc(db, "usernames/guest"), { uid: "guest", createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, "users/guest"), userData()));
    await assertFails(setDoc(doc(db, "friendRequests/guest_alice"), { from: "guest", to: "alice", createdAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, "usernames/alice")));
    await assertFails(deleteDoc(doc(db, "friendRequests/alice_bob")));
    // Not even no-op deletes of missing docs.
    await assertFails(deleteDoc(doc(db, "friendRequests/bob_alice")));
    await assertFails(deleteDoc(doc(db, "friendships/alice_bob")));
  });
});

describe("users/{uid} and its private subcollections", () => {
  beforeEach(async () => {
    await seedAccount("alice");
    await seedAccount("bob");
    await seedFriendship("alice", "bob");
  });

  test("owner can create, read, update and delete their user doc", async () => {
    const ref = doc(userDb("alice"), "users/alice");
    await assertSucceeds(setDoc(ref, userData({ email: null })));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { privacy: { shareWatched: false, shareRatings: true }, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { privacy: { shareWatched: false }, updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(ref));
  });

  test.each<[string, DocumentData]>([
    ["an unknown key", { isAdmin: true }],
    ["a legacy key", { watchlist: [] }],
    ["an extra privacy key", { privacy: { shareWatched: true, shareRatings: true, shareEmail: true } }],
    ["a non-bool privacy flag", { privacy: { shareWatched: "yes", shareRatings: true } }],
    ["11 favorite genres", { preferences: { favoriteGenres: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], preferredLanguage: null } }],
    ["an invalid preferred language", { preferences: { favoriteGenres: [], preferredLanguage: "english" } }],
    ["a non-int schemaVersion", { schemaVersion: "2" }],
    ["an email over 254 chars", { email: `${"a".repeat(250)}@x.io` }],
  ])("owner cannot create a user doc with %s", async (_label, overrides) => {
    await assertFails(setDoc(doc(userDb("alice"), "users/alice"), userData(overrides)));
  });

  test("another signed-in user, even a friend, cannot read or write the user doc", async () => {
    await seedDoc("users/alice", userData());
    const bob = userDb("bob");
    await assertFails(getDoc(doc(bob, "users/alice")));
    await assertFails(setDoc(doc(bob, "users/alice"), userData()));
    await assertFails(updateDoc(doc(bob, "users/alice"), { updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(bob, "users/alice")));
    await assertFails(setDoc(doc(bob, "users/carol"), userData()));
  });

  test.each<[string, string, string, (id: string) => DocumentData]>([
    ["watchlists", "list1", "list2", () => listData()],
    ["library", "603", "604", (id) => entryData(Number(id))],
    ["activity", "act1", "act2", () => activityData()],
  ])("users/{uid}/%s is owner-only for reads and writes", async (sub, id, otherId, data) => {
    const alice = userDb("alice");
    const bob = userDb("bob"); // a friend of alice
    await assertSucceeds(setDoc(doc(alice, `users/alice/${sub}/${id}`), data(id)));
    await assertSucceeds(getDoc(doc(alice, `users/alice/${sub}/${id}`)));
    const listed = await assertSucceeds(getDocs(collection(alice, `users/alice/${sub}`)));
    expect(listed.docs.map((d) => d.id)).toEqual([id]);

    await assertFails(getDoc(doc(bob, `users/alice/${sub}/${id}`)));
    await assertFails(getDocs(collection(bob, `users/alice/${sub}`)));
    await assertFails(setDoc(doc(bob, `users/alice/${sub}/${otherId}`), data(otherId)));
    await assertFails(setDoc(doc(bob, `users/alice/${sub}/${id}`), data(id)));
    await assertFails(deleteDoc(doc(bob, `users/alice/${sub}/${id}`)));

    await assertSucceeds(deleteDoc(doc(alice, `users/alice/${sub}/${id}`)));
  });
});

describe("users/{uid}/shared/index", () => {
  const INDEX = "users/alice/shared/index";

  beforeEach(async () => {
    await seedAccount("alice");
    await seedAccount("bob");
    await seedAccount("carol");
    await seedFriendship("alice", "bob");
  });

  test("owner can create, update, read and delete it", async () => {
    const alice = userDb("alice");
    await assertSucceeds(setDoc(doc(alice, INDEX), sharedIndexData()));
    await assertSucceeds(setDoc(doc(alice, INDEX), sharedIndexData({ movies: {}, lists: {} })));
    const snap = await assertSucceeds(getDoc(doc(alice, INDEX)));
    expect(snap.data()?.movies).toEqual({});
    await assertSucceeds(deleteDoc(doc(alice, INDEX)));
  });

  test("a friend can read it; a non-friend cannot", async () => {
    await seedDoc(INDEX, sharedIndexData());
    const snap = await assertSucceeds(getDoc(doc(userDb("bob"), INDEX)));
    expect(snap.data()?.version).toBe(1);
    await assertFails(getDoc(doc(userDb("carol"), INDEX)));
  });

  test("a pending friend request does not grant access", async () => {
    await seedDoc(INDEX, sharedIndexData());
    await seedRequest("carol", "alice");
    await assertFails(getDoc(doc(userDb("carol"), INDEX)));
  });

  test("access ends when the friendship is deleted", async () => {
    await seedDoc(INDEX, sharedIndexData());
    await assertSucceeds(getDoc(doc(userDb("bob"), INDEX)));
    await seed((db) => deleteDoc(doc(db, "friendships/alice_bob")));
    await assertFails(getDoc(doc(userDb("bob"), INDEX)));
  });

  test("a friend cannot write it", async () => {
    const bob = userDb("bob");
    await assertFails(setDoc(doc(bob, INDEX), sharedIndexData()));
    await seedDoc(INDEX, sharedIndexData());
    await assertFails(setDoc(doc(bob, INDEX), sharedIndexData({ movies: {} })));
    await assertFails(updateDoc(doc(bob, INDEX), { movies: {}, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(bob, INDEX)));
  });

  test("only the doc id `index` is allowed", async () => {
    const alice = userDb("alice");
    await assertFails(setDoc(doc(alice, "users/alice/shared/other"), sharedIndexData()));
    await seedDoc("users/alice/shared/other", sharedIndexData());
    await assertFails(getDoc(doc(alice, "users/alice/shared/other")));
    await assertFails(getDoc(doc(userDb("bob"), "users/alice/shared/other")));
    await assertFails(getDocs(collection(userDb("bob"), "users/alice/shared")));
  });

  test.each<[string, () => DocumentData]>([
    ["version 2", () => sharedIndexData({ version: 2 })],
    ["no version", () => without(sharedIndexData(), "version")],
    ["movies as a list", () => sharedIndexData({ movies: ["603"] })],
    ["lists as a string", () => sharedIndexData({ lists: "list1" })],
    ["51 lists", () => sharedIndexData({ lists: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`l${i}`, { n: "x", d: "", c: 0, u: 0 }])) })],
    ["a client-side updatedAt", () => sharedIndexData({ updatedAt: Timestamp.now() })],
    ["no updatedAt", () => without(sharedIndexData(), "updatedAt")],
    ["an extra key", () => sharedIndexData({ owner: "alice" })],
  ])("rejects an index with %s", async (_label, data) => {
    await assertFails(setDoc(doc(userDb("alice"), INDEX), data()));
  });
});

describe("profiles", () => {
  test("any signed-in user can get any profile", async () => {
    await seedAccount("alice", { discoverable: false });
    const snap = await assertSucceeds(getDoc(doc(userDb("bob"), "profiles/alice")));
    expect(snap.data()?.username).toBe("alice");
    await assertSucceeds(getDoc(doc(userDb("bob"), "profiles/nobody")));
  });

  test("list queries must be constrained to discoverable profiles", async () => {
    await seedAccount("alice");
    await seedAccount("bob");
    await seedAccount("dave", { discoverable: false });
    const profiles = collection(userDb("carol"), "profiles");

    await assertFails(getDocs(profiles));
    await assertFails(getDocs(query(profiles, where("usernameLower", "==", "dave"))));
    await assertFails(getDocs(query(profiles, where("discoverable", "==", false))));

    const all = await assertSucceeds(getDocs(query(profiles, where("discoverable", "==", true))));
    expect(all.docs.map((d) => d.id).sort()).toEqual(["alice", "bob"]);

    // The exact shape of searchProfiles' prefix query.
    const search = await assertSucceeds(
      getDocs(
        query(
          profiles,
          where("discoverable", "==", true),
          where("usernameLower", ">=", "da"),
          where("usernameLower", "<=", "da"),
          orderBy("usernameLower"),
          limit(10),
        ),
      ),
    );
    expect(search.empty).toBe(true);
  });

  describe("create", () => {
    test("succeeds together with the matching username claim in the same batch", async () => {
      await assertSucceeds(claimAndCreateProfile(userDb("alice"), "alice", profileData("alice", { username: "Alice_1", usernameLower: "alice_1" })));
    });

    test("is denied without a username claim", async () => {
      await assertFails(setDoc(doc(userDb("alice"), "profiles/alice"), profileData("alice")));
    });

    test("is denied when the username is claimed by someone else", async () => {
      await seedDoc("usernames/alice", { uid: "bob", createdAt: PAST });
      await assertFails(setDoc(doc(userDb("alice"), "profiles/alice"), profileData("alice")));
    });

    test("cannot create someone else's profile", async () => {
      await seedDoc("usernames/alice", { uid: "alice", createdAt: PAST });
      await assertFails(setDoc(doc(userDb("bob"), "profiles/alice"), profileData("alice")));
      await assertFails(claimAndCreateProfile(userDb("bob"), "alice", profileData("alice", { username: "alice2", usernameLower: "alice2" })));
    });

    describe("field validation", () => {
      // The claim is seeded with rules disabled so only the profile rule is exercised.
      async function createProfileOnly(profile: DocumentData) {
        await seedDoc(`usernames/${profile.usernameLower}`, { uid: "alice", createdAt: PAST });
        return setDoc(doc(userDb("alice"), "profiles/alice"), profile);
      }

      test("control: a valid profile passes when the claim is already held", async () => {
        await assertSucceeds(createProfileOnly(profileData("alice")));
      });

      test("accepts a bio of exactly 160 chars", async () => {
        await assertSucceeds(createProfileOnly(profileData("alice", { bio: "x".repeat(160) })));
      });

      test.each<[string, () => DocumentData]>([
        ["a username with invalid characters", () => profileData("alice", { username: "al-ice", usernameLower: "al-ice" })],
        ["a 2-char username", () => profileData("alice", { username: "al", usernameLower: "al" })],
        ["a 21-char username", () => profileData("alice", { username: "a".repeat(21), usernameLower: "a".repeat(21) })],
        ["usernameLower not matching username", () => profileData("alice", { username: "Alice", usernameLower: "alicia" })],
        ["an extra key", () => profileData("alice", { email: "alice@example.com" })],
        ["a missing key", () => without(profileData("alice"), "bio")],
        ["a 161-char bio", () => profileData("alice", { bio: "x".repeat(161) })],
        ["avatarColor 'red'", () => profileData("alice", { avatarColor: "red" })],
        ["avatarColor with 5 hex digits", () => profileData("alice", { avatarColor: "#12345" })],
        ["avatarColor with non-hex digits", () => profileData("alice", { avatarColor: "#GGGGGG" })],
        ["an empty displayName", () => profileData("alice", { displayName: "" })],
        ["a 41-char displayName", () => profileData("alice", { displayName: "x".repeat(41) })],
        ["a non-bool discoverable", () => profileData("alice", { discoverable: "yes" })],
        ["a non-bool allowFriendRequests", () => profileData("alice", { allowFriendRequests: 1 })],
        ["the uid of another user", () => profileData("alice", { uid: "bob" })],
        ["a client-side createdAt", () => profileData("alice", { createdAt: PAST })],
        ["a client-side updatedAt", () => profileData("alice", { updatedAt: PAST })],
      ])("rejects %s", async (_label, make) => {
        await assertFails(createProfileOnly(make()));
      });
    });
  });

  describe("update", () => {
    const ref = () => doc(userDb("alice"), "profiles/alice");

    beforeEach(async () => {
      await seedAccount("alice");
    });

    test("owner can edit fields when updatedAt is the request time", async () => {
      await assertSucceeds(
        updateDoc(ref(), {
          displayName: "Alice L",
          displayNameLower: "alice l",
          bio: "Hi",
          avatarColor: "#1E88E5",
          discoverable: false,
          allowFriendRequests: false,
          updatedAt: serverTimestamp(),
        }),
      );
    });

    test("updatedAt must be bumped to the request time", async () => {
      await assertFails(updateDoc(ref(), { bio: "Hi" }));
      await assertFails(updateDoc(ref(), { bio: "Hi", updatedAt: Timestamp.now() }));
    });

    test("createdAt is immutable", async () => {
      await assertFails(updateDoc(ref(), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(ref(), { createdAt: Timestamp.fromMillis(0), updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(ref(), { createdAt: deleteField(), updatedAt: serverTimestamp() }));
    });

    test("field validation still applies", async () => {
      await assertFails(updateDoc(ref(), { bio: "x".repeat(161), updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(ref(), { isAdmin: true, updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(ref(), { uid: "bob", updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(ref(), { avatarColor: "#fff", updatedAt: serverTimestamp() }));
    });

    test("cannot update or delete someone else's profile", async () => {
      await seedAccount("bob");
      await assertFails(updateDoc(doc(userDb("bob"), "profiles/alice"), { bio: "pwned", updatedAt: serverTimestamp() }));
      await assertFails(deleteDoc(doc(userDb("bob"), "profiles/alice")));
    });

    test("a new username must be claimed in the same batch", async () => {
      await assertFails(updateDoc(ref(), { username: "alice2", usernameLower: "alice2", updatedAt: serverTimestamp() }));
      await seedDoc("usernames/alice3", { uid: "bob", createdAt: PAST });
      await assertFails(updateDoc(ref(), { username: "alice3", usernameLower: "alice3", updatedAt: serverTimestamp() }));
    });

    test("changing only the case of the username needs no new claim", async () => {
      await assertSucceeds(updateDoc(ref(), { username: "ALICE", usernameLower: "alice", updatedAt: serverTimestamp() }));
    });

    test("owner can delete their profile", async () => {
      await assertSucceeds(deleteDoc(ref()));
    });
  });
});

describe("usernames", () => {
  const claim = (uid: string) => ({ uid, createdAt: serverTimestamp() });

  test("signed-in users can get a claim but not list them", async () => {
    await seedAccount("alice");
    await assertSucceeds(getDoc(doc(userDb("bob"), "usernames/alice")));
    await assertFails(getDocs(collection(userDb("bob"), "usernames")));
  });

  test("a claim without a matching profile in the same batch is denied", async () => {
    await assertFails(setDoc(doc(userDb("alice"), "usernames/alice"), claim("alice")));
  });

  test("cannot claim a name the creator's profile does not use", async () => {
    await seedAccount("alice");
    await assertFails(setDoc(doc(userDb("alice"), "usernames/alice_alt"), claim("alice")));
  });

  test("cannot claim on behalf of another user", async () => {
    // bob's profile already uses "bob", so only the claim's uid is under test.
    await seedDoc("profiles/bob", profileData("bob"));
    await assertFails(setDoc(doc(userDb("bob"), "usernames/bob"), claim("alice")));
    await assertSucceeds(setDoc(doc(userDb("bob"), "usernames/bob"), claim("bob")));
  });

  test.each<[string, DocumentData]>([
    ["an extra key", { uid: "alice", createdAt: serverTimestamp(), admin: true }],
    ["a client-side createdAt", { uid: "alice", createdAt: PAST }],
  ])("rejects a claim with %s", async (_label, data) => {
    const alice = userDb("alice");
    const batch = writeBatch(alice);
    batch.set(doc(alice, "usernames/alice"), data);
    batch.set(doc(alice, "profiles/alice"), profileData("alice"));
    await assertFails(batch.commit());
  });

  test("cannot overwrite an existing claim (username already taken)", async () => {
    await seedAccount("alice");
    await assertFails(claimAndCreateProfile(userDb("bob"), "bob", profileData("bob", { username: "Alice", usernameLower: "alice" })));
    await assertFails(setDoc(doc(userDb("alice"), "usernames/alice"), claim("alice")));
    expect((await readAsAdmin("usernames/alice"))?.uid).toBe("alice");
  });

  test.each(["Alice", "al", "a".repeat(21), "al-ice", "al ice", "alicé"])("cannot claim the invalid id %p", async (name) => {
    // The profile already uses `name`, so only the id pattern is under test.
    await seedDoc("profiles/alice", profileData("alice", { usernameLower: name }));
    await assertFails(setDoc(doc(userDb("alice"), `usernames/${name}`), claim("alice")));
  });

  test("control: a lowercase id used by the profile can be claimed", async () => {
    await seedDoc("profiles/alice", profileData("alice", { username: "Alice_9", usernameLower: "alice_9" }));
    await assertSucceeds(setDoc(doc(userDb("alice"), "usernames/alice_9"), claim("alice")));
  });

  describe("releasing a claim", () => {
    beforeEach(async () => {
      await seedAccount("alice");
    });

    test("is denied while the profile still uses it", async () => {
      await assertFails(deleteDoc(doc(userDb("alice"), "usernames/alice")));
    });

    test("is denied for someone else's claim, even an unused one", async () => {
      await seedDoc("usernames/old_alice", { uid: "alice", createdAt: PAST });
      await assertFails(deleteDoc(doc(userDb("bob"), "usernames/old_alice")));
      await assertSucceeds(deleteDoc(doc(userDb("alice"), "usernames/old_alice")));
    });

    test("username change batch (create new + delete old + update profile) succeeds", async () => {
      const alice = userDb("alice");
      const batch = writeBatch(alice);
      batch.set(doc(alice, "usernames/alice_new"), claim("alice"));
      batch.delete(doc(alice, "usernames/alice"));
      batch.update(doc(alice, "profiles/alice"), { username: "Alice_New", usernameLower: "alice_new", updatedAt: serverTimestamp() });
      await assertSucceeds(batch.commit());
      expect(await readAsAdmin("usernames/alice")).toBeUndefined();
      expect((await readAsAdmin("usernames/alice_new"))?.uid).toBe("alice");
      // The released name is free for someone else.
      await assertSucceeds(claimAndCreateProfile(userDb("bob"), "bob", profileData("bob", { username: "alice", usernameLower: "alice" })));
    });

    test("a username change that keeps the old claim is denied (no hoarding)", async () => {
      const alice = userDb("alice");
      const batch = writeBatch(alice);
      batch.set(doc(alice, "usernames/alice_new"), claim("alice"));
      batch.update(doc(alice, "profiles/alice"), { username: "Alice_New", usernameLower: "alice_new", updatedAt: serverTimestamp() });
      await assertFails(batch.commit());
      expect(await readAsAdmin("usernames/alice_new")).toBeUndefined();
      expect((await readAsAdmin("profiles/alice"))?.usernameLower).toBe("alice");
    });

    test("a username change is allowed when the old claim is already gone", async () => {
      await seed((db) => deleteDoc(doc(db, "usernames/alice")));
      const alice = userDb("alice");
      const batch = writeBatch(alice);
      batch.set(doc(alice, "usernames/alice_new"), claim("alice"));
      batch.update(doc(alice, "profiles/alice"), { username: "Alice_New", usernameLower: "alice_new", updatedAt: serverTimestamp() });
      await assertSucceeds(batch.commit());
    });

    test("deleting the old claim without moving the profile is denied", async () => {
      const alice = userDb("alice");
      const batch = writeBatch(alice);
      batch.set(doc(alice, "usernames/alice_new"), claim("alice"));
      batch.delete(doc(alice, "usernames/alice"));
      await assertFails(batch.commit());
    });

    test("can be released once the profile is deleted", async () => {
      const alice = userDb("alice");
      await assertSucceeds(deleteDoc(doc(alice, "profiles/alice")));
      await assertSucceeds(deleteDoc(doc(alice, "usernames/alice")));
    });

    test("can be released in the same batch that deletes the profile", async () => {
      const alice = userDb("alice");
      const batch = writeBatch(alice);
      batch.delete(doc(alice, "profiles/alice"));
      batch.delete(doc(alice, "usernames/alice"));
      await assertSucceeds(batch.commit());
    });
  });
});

describe("watchlists", () => {
  const ref = () => doc(userDb("alice"), "users/alice/watchlists/list1");

  test("a valid list can be created and updated; createdAt is immutable", async () => {
    await assertSucceeds(setDoc(ref(), listData({ name: "x".repeat(60), description: "d".repeat(280), visibility: "private" })));
    await assertSucceeds(updateDoc(ref(), { name: "Renamed", visibility: "friends", updatedAt: Timestamp.now() }));
    await assertFails(updateDoc(ref(), { createdAt: Timestamp.now(), updatedAt: Timestamp.now() }));
  });

  test.each<[string, () => DocumentData]>([
    ["an empty name", () => listData({ name: "" })],
    ["a 61-char name", () => listData({ name: "x".repeat(61) })],
    ["a 281-char description", () => listData({ description: "d".repeat(281) })],
    ["visibility 'public'", () => listData({ visibility: "public" })],
    ["an extra key", () => listData({ movies: [603] })],
    ["a non-timestamp createdAt", () => listData({ createdAt: "2024-01-01" })],
    ["no updatedAt", () => without(listData(), "updatedAt")],
  ])("rejects a list with %s", async (_label, data) => {
    await assertFails(setDoc(ref(), data()));
  });
});

describe("library entries", () => {
  const ref = (movieId = "603") => doc(userDb("alice"), `users/alice/library/${movieId}`);

  test("a valid entry can be created and updated", async () => {
    await assertSucceeds(setDoc(ref(), entryData(603)));
    await assertSucceeds(
      setDoc(ref(), entryData(603, { watched: true, watchedAt: Timestamp.now(), rating: 5, ratedAt: Timestamp.now(), addedAt: PAST })),
    );
    await assertSucceeds(updateDoc(ref(), { rating: 1, updatedAt: serverTimestamp() }));
  });

  test.each<[string, DocumentData]>([
    ["rating 1", { rating: 1 }],
    ["rating 5", { rating: 5 }],
    ["rating null", { rating: null }],
    ["50 listIds", { listIds: Array.from({ length: 50 }, (_, i) => `list${i}`) }],
    ["no listIds (watched only)", { listIds: [], watched: true, watchedAt: Timestamp.now() }],
    ["null optional fields", { posterPath: null, releaseDate: null, year: null, originalLanguage: null }],
  ])("accepts an entry with %s", async (_label, overrides) => {
    await assertSucceeds(setDoc(ref(), entryData(603, overrides)));
  });

  test.each<[string, () => DocumentData]>([
    ["a movieId different from the doc id", () => entryData(604)],
    ["a string movieId", () => entryData(603, { movieId: "603" })],
    ["a fractional movieId", () => entryData(603, { movieId: 603.5 })],
    ["rating 0", () => entryData(603, { rating: 0 })],
    ["rating 6", () => entryData(603, { rating: 6 })],
    ["a fractional rating", () => entryData(603, { rating: 3.5 })],
    ["a string rating", () => entryData(603, { rating: "4" })],
    ["51 listIds", () => entryData(603, { listIds: Array.from({ length: 51 }, (_, i) => `list${i}`) })],
    ["listIds as a string", () => entryData(603, { listIds: "list1" })],
    ["an extra key", () => entryData(603, { notes: "secret" })],
    ["a client-side updatedAt", () => entryData(603, { updatedAt: Timestamp.now() })],
    ["no updatedAt", () => without(entryData(603), "updatedAt")],
    ["an empty title", () => entryData(603, { title: "" })],
    ["21 genre ids", () => entryData(603, { genreIds: Array.from({ length: 21 }, (_, i) => i) })],
    ["a string voteAverage", () => entryData(603, { voteAverage: "8.2" })],
    ["a non-bool watched", () => entryData(603, { watched: "yes" })],
    ["a null addedAt", () => entryData(603, { addedAt: null })],
  ])("rejects an entry with %s", async (_label, data) => {
    await assertFails(setDoc(ref(), data()));
  });

  test("movieId must be a positive integer, even when it matches the doc id", async () => {
    await assertFails(setDoc(ref("0"), entryData(0)));
    await assertFails(setDoc(ref("-1"), entryData(-1)));
    await assertFails(setDoc(ref("603.5"), entryData(603.5)));
  });

  test("an update must set updatedAt to the request time", async () => {
    await seedDoc("users/alice/library/603", entryData(603));
    await assertFails(updateDoc(ref(), { watched: true }));
    await assertFails(updateDoc(ref(), { watched: true, updatedAt: Timestamp.now() }));
    await assertSucceeds(updateDoc(ref(), { watched: true, updatedAt: serverTimestamp() }));
  });
});

describe("activity", () => {
  const activity = () => collection(userDb("alice"), "users/alice/activity");

  test.each([
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
  ])("a valid %s entry can be created", async (type) => {
    await assertSucceeds(setDoc(doc(activity()), activityData({ type })));
  });

  test("entries cannot be updated, not even by the owner", async () => {
    await seedDoc("users/alice/activity/act1", activityData({ createdAt: PAST }));
    await assertFails(updateDoc(doc(activity(), "act1"), { title: "Changed" }));
    await assertFails(setDoc(doc(activity(), "act1"), activityData()));
  });

  test("owner can read and delete entries", async () => {
    await seedDoc("users/alice/activity/act1", activityData({ createdAt: PAST }));
    await assertSucceeds(getDocs(activity()));
    await assertSucceeds(deleteDoc(doc(activity(), "act1")));
  });

  test.each<[string, DocumentData]>([
    ["an unknown type", { type: "hacked" }],
    ["a client-side createdAt", { createdAt: Timestamp.now() }],
    ["an extra key", { extra: 1 }],
    ["rating 6", { type: "rated", rating: 6 }],
    ["a string movieId", { movieId: "603" }],
    ["a 61-char listName", { listName: "x".repeat(61) }],
  ])("rejects an entry with %s", async (_label, overrides) => {
    await assertFails(setDoc(doc(activity()), activityData(overrides)));
  });
});

describe("friendRequests", () => {
  const request = (from: string, to: string) => ({ from, to, createdAt: serverTimestamp() });
  const send = (me: string, id: string, data: DocumentData) => setDoc(doc(userDb(me), "friendRequests", id), data);

  beforeEach(async () => {
    await seedAccount("alice");
    await seedAccount("bob");
    await seedAccount("carol");
  });

  test("a valid request can be created", async () => {
    await assertSucceeds(send("alice", "alice_bob", request("alice", "bob")));
  });

  test("self-requests are denied", async () => {
    await assertFails(send("alice", "alice_alice", request("alice", "alice")));
  });

  test("the id must be `${from}_${to}`", async () => {
    await assertFails(send("alice", "bob_alice", request("alice", "bob")));
    await assertFails(send("alice", "alice_carol", request("alice", "bob")));
  });

  test("from must be the signed-in user", async () => {
    await assertFails(send("alice", "alice_carol", request("bob", "carol")));
    await assertFails(send("alice", "bob_carol", request("bob", "carol")));
    await assertFails(send("alice", "bob_alice", request("bob", "alice")));
  });

  test("the recipient must have a profile", async () => {
    await assertFails(send("alice", "alice_dave", request("alice", "dave")));
  });

  test("the recipient must allow friend requests", async () => {
    await seedAccount("dave", { allowFriendRequests: false });
    await assertFails(send("alice", "alice_dave", request("alice", "dave")));
  });

  test("the sender must have a profile", async () => {
    await assertFails(send("eve", "eve_bob", request("eve", "bob")));
  });

  test("denied when already friends", async () => {
    await seedFriendship("alice", "bob");
    await assertFails(send("alice", "alice_bob", request("alice", "bob")));
  });

  test("denied when the other user's request is pending", async () => {
    await seedRequest("bob", "alice");
    await assertFails(send("alice", "alice_bob", request("alice", "bob")));
  });

  test("duplicates are denied (a second write to the same id is an update)", async () => {
    await assertSucceeds(send("alice", "alice_bob", request("alice", "bob")));
    await assertFails(send("alice", "alice_bob", request("alice", "bob")));
  });

  test.each<[string, string, DocumentData]>([
    ["an extra key", "alice_bob", { from: "alice", to: "bob", createdAt: serverTimestamp(), message: "hi" }],
    ["a client-side createdAt", "alice_bob", { from: "alice", to: "bob", createdAt: PAST }],
    ["a non-string recipient", "alice_42", { from: "alice", to: 42, createdAt: serverTimestamp() }],
  ])("rejects a request with %s", async (_label, id, data) => {
    await assertFails(send("alice", id, data));
  });

  describe("reading", () => {
    beforeEach(async () => {
      await seedRequest("alice", "bob");
    });

    test("only the two parties can get a request", async () => {
      await assertSucceeds(getDoc(doc(userDb("alice"), "friendRequests/alice_bob")));
      await assertSucceeds(getDoc(doc(userDb("bob"), "friendRequests/alice_bob")));
      await assertFails(getDoc(doc(userDb("carol"), "friendRequests/alice_bob")));
    });

    test("a third user is denied even for a non-existent id involving others", async () => {
      await assertFails(getDoc(doc(userDb("carol"), "friendRequests/bob_alice")));
      await assertFails(getDoc(doc(userDb("carol"), "friendRequests/alice_dave")));
      // A party may check for a (missing) request involving themselves.
      const own = await assertSucceeds(getDoc(doc(userDb("alice"), "friendRequests/bob_alice")));
      expect(own.exists()).toBe(false);
    });

    test("incoming and outgoing list queries succeed for the signed-in user", async () => {
      const incoming = await assertSucceeds(getDocs(query(collection(userDb("bob"), "friendRequests"), where("to", "==", "bob"))));
      expect(incoming.docs.map((d) => d.id)).toEqual(["alice_bob"]);
      const outgoing = await assertSucceeds(getDocs(query(collection(userDb("alice"), "friendRequests"), where("from", "==", "alice"))));
      expect(outgoing.docs.map((d) => d.id)).toEqual(["alice_bob"]);
    });

    test("list queries about other users, or unfiltered, are denied", async () => {
      const requests = collection(userDb("carol"), "friendRequests");
      await assertFails(getDocs(query(requests, where("to", "==", "bob"))));
      await assertFails(getDocs(query(requests, where("from", "==", "alice"))));
      await assertFails(getDocs(requests));
    });
  });

  describe("deleting", () => {
    beforeEach(async () => {
      await seedRequest("alice", "bob");
    });

    test("the sender can cancel", async () => {
      await assertSucceeds(deleteDoc(doc(userDb("alice"), "friendRequests/alice_bob")));
    });

    test("the recipient can decline", async () => {
      await assertSucceeds(deleteDoc(doc(userDb("bob"), "friendRequests/alice_bob")));
    });

    test("a third party cannot delete", async () => {
      await assertFails(deleteDoc(doc(userDb("carol"), "friendRequests/alice_bob")));
    });

    test("deleting an already-removed request is an allowed no-op for either party", async () => {
      // e.g. it was accepted or cancelled in the meantime
      await seed((db) => deleteDoc(doc(db, "friendRequests/alice_bob")));
      await assertSucceeds(deleteDoc(doc(userDb("alice"), "friendRequests/alice_bob")));
      await assertSucceeds(deleteDoc(doc(userDb("bob"), "friendRequests/alice_bob")));
    });

    test("deleting a missing request whose id does not include you is denied", async () => {
      await assertFails(deleteDoc(doc(userDb("carol"), "friendRequests/bob_alice")));
      await assertFails(deleteDoc(doc(userDb("carol"), "friendRequests/carolx_bob")));
    });

    test("an existing request is judged by its from/to, not by its id", async () => {
      await seedDoc("friendRequests/carol_dave", { from: "alice", to: "bob", createdAt: PAST });
      await assertFails(deleteDoc(doc(userDb("carol"), "friendRequests/carol_dave")));
      await assertSucceeds(deleteDoc(doc(userDb("bob"), "friendRequests/carol_dave")));
    });

    test("nobody can update a request", async () => {
      await assertFails(updateDoc(doc(userDb("alice"), "friendRequests/alice_bob"), { createdAt: serverTimestamp() }));
      await assertFails(updateDoc(doc(userDb("bob"), "friendRequests/alice_bob"), { to: "carol" }));
    });
  });
});

describe("friendships", () => {
  const friendship = (members: string[], requestedBy: string) => ({ members, requestedBy, createdAt: serverTimestamp() });

  /** The accept batch: create the friendship and (optionally) delete a request. */
  function accept(me: string, id: string, data: DocumentData, deleteRequest: string | null) {
    const db = userDb(me);
    const batch = writeBatch(db);
    batch.set(doc(db, "friendships", id), data);
    if (deleteRequest) batch.delete(doc(db, "friendRequests", deleteRequest));
    return batch.commit();
  }

  beforeEach(async () => {
    await seedAccount("alice");
    await seedAccount("bob");
    await seedAccount("carol");
    await seedRequest("alice", "bob"); // alice asked bob
  });

  test("the recipient can accept: create the friendship and delete the request in one batch", async () => {
    await assertSucceeds(accept("bob", "alice_bob", friendship(["alice", "bob"], "alice"), "alice_bob"));
    expect(await readAsAdmin("friendRequests/alice_bob")).toBeUndefined();
    expect((await readAsAdmin("friendships/alice_bob"))?.members).toEqual(["alice", "bob"]);
  });

  test("denied without a pending request", async () => {
    await assertFails(accept("carol", "alice_carol", friendship(["alice", "carol"], "alice"), null));
    await assertFails(accept("carol", "alice_carol", friendship(["alice", "carol"], "alice"), "alice_carol"));
  });

  test("the sender cannot create the friendship from their own request", async () => {
    await assertFails(accept("alice", "alice_bob", friendship(["alice", "bob"], "bob"), "alice_bob"));
    await assertFails(accept("alice", "alice_bob", friendship(["alice", "bob"], "alice"), "alice_bob"));
  });

  test("denied when the request is not deleted in the same batch", async () => {
    await assertFails(accept("bob", "alice_bob", friendship(["alice", "bob"], "alice"), null));
  });

  test("members must be sorted and match the id", async () => {
    await assertFails(accept("bob", "alice_bob", friendship(["bob", "alice"], "alice"), "alice_bob"));
    await assertFails(accept("bob", "bob_alice", friendship(["alice", "bob"], "alice"), "alice_bob"));
    await assertFails(accept("bob", "bob_alice", friendship(["bob", "alice"], "alice"), "alice_bob"));
  });

  test("an outsider cannot create a friendship between others", async () => {
    await assertFails(accept("carol", "alice_bob", friendship(["alice", "bob"], "alice"), null));
    await assertFails(accept("carol", "alice_bob", friendship(["alice", "bob"], "alice"), "alice_bob"));
    // ...not even by consuming a request they received from one of them.
    await seedRequest("alice", "carol");
    await assertFails(accept("carol", "alice_bob", friendship(["alice", "bob"], "alice"), "alice_carol"));
  });

  test("requestedBy must be the other member", async () => {
    // bob holds a request from carol; it cannot be used to befriend alice.
    await seedRequest("carol", "bob");
    await assertFails(accept("bob", "alice_bob", friendship(["alice", "bob"], "carol"), "carol_bob"));
  });

  test.each<[string, DocumentData]>([
    ["an extra key", { ...friendship(["alice", "bob"], "alice"), note: "hi" }],
    ["a client-side createdAt", { members: ["alice", "bob"], requestedBy: "alice", createdAt: PAST }],
    ["three members", friendship(["alice", "bob", "carol"], "alice")],
  ])("rejects a friendship with %s", async (_label, data) => {
    await assertFails(accept("bob", "alice_bob", data, "alice_bob"));
  });

  describe("existing friendships", () => {
    beforeEach(async () => {
      await seedFriendship("alice", "bob");
    });

    test("only members can get it", async () => {
      await assertSucceeds(getDoc(doc(userDb("alice"), "friendships/alice_bob")));
      await assertSucceeds(getDoc(doc(userDb("bob"), "friendships/alice_bob")));
      await assertFails(getDoc(doc(userDb("carol"), "friendships/alice_bob")));
    });

    test("members can list their friendships with array-contains", async () => {
      const res = await assertSucceeds(getDocs(query(collection(userDb("alice"), "friendships"), where("members", "array-contains", "alice"))));
      expect(res.docs.map((d) => d.id)).toEqual(["alice_bob"]);
    });

    test("outsiders cannot list someone else's friendships; unfiltered lists are denied", async () => {
      await assertFails(getDocs(query(collection(userDb("carol"), "friendships"), where("members", "array-contains", "alice"))));
      await assertFails(getDocs(collection(userDb("alice"), "friendships")));
    });

    test("either member can delete it; an outsider cannot", async () => {
      await assertFails(deleteDoc(doc(userDb("carol"), "friendships/alice_bob")));
      await assertSucceeds(deleteDoc(doc(userDb("bob"), "friendships/alice_bob")));
      await seedFriendship("alice", "bob");
      await assertSucceeds(deleteDoc(doc(userDb("alice"), "friendships/alice_bob")));
    });

    test("updates are denied", async () => {
      await assertFails(updateDoc(doc(userDb("alice"), "friendships/alice_bob"), { requestedBy: "alice" }));
      await assertFails(accept("bob", "alice_bob", friendship(["alice", "bob"], "alice"), "alice_bob"));
    });

    test("an existing friendship is judged by its members, not by its id", async () => {
      await seedDoc("friendships/carol_dave", { members: ["alice", "bob"], requestedBy: "alice", createdAt: PAST });
      await assertFails(deleteDoc(doc(userDb("carol"), "friendships/carol_dave")));
      await assertSucceeds(deleteDoc(doc(userDb("alice"), "friendships/carol_dave")));
    });
  });

  test("deleting an already-removed friendship is an allowed no-op for its members only", async () => {
    // friendships/alice_bob does not exist (e.g. the other member just removed it)
    await assertSucceeds(deleteDoc(doc(userDb("alice"), "friendships/alice_bob")));
    await assertSucceeds(deleteDoc(doc(userDb("bob"), "friendships/alice_bob")));
    await assertFails(deleteDoc(doc(userDb("carol"), "friendships/alice_bob")));
    await assertFails(deleteDoc(doc(userDb("carol"), "friendships/carolx_dave")));
  });
});

describe("legacy v1 user docs", () => {
  const legacy = {
    name: "Alice",
    watchlist: [{ id: 603, title: "The Matrix", poster_path: "/x.jpg", release_date: "1999-03-30", genre_ids: [28, 878], vote_average: 8.2 }],
    friends: [{ id: "bob", name: "Bob" }],
  };
  const ref = () => doc(userDb("alice"), "users/alice");

  beforeEach(async () => {
    await seedDoc("users/alice", legacy);
  });

  test("owner can read it; others cannot", async () => {
    const snap = await assertSucceeds(getDoc(ref()));
    expect(snap.data()).toEqual(legacy);
    await assertFails(getDoc(doc(userDb("bob"), "users/alice")));
  });

  test("owner can update privacy and schemaVersion without touching legacy fields", async () => {
    await assertSucceeds(updateDoc(ref(), { privacy: { shareWatched: true, shareRatings: false }, schemaVersion: 2, updatedAt: serverTimestamp() }));
    const after = await readAsAdmin("users/alice");
    expect(after).toMatchObject(legacy);
    expect(after?.schemaVersion).toBe(2);
  });

  test("a merge-set of the v2 fields (as setupAccount writes) is allowed", async () => {
    await assertSucceeds(
      setDoc(
        ref(),
        {
          email: "alice@example.com",
          privacy: { shareWatched: true, shareRatings: true },
          preferences: { favoriteGenres: [], preferredLanguage: null },
          schemaVersion: 2,
          migratedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    );
    expect(await readAsAdmin("users/alice")).toMatchObject(legacy);
  });

  test.each<[string, DocumentData]>([
    ["replacing watchlist", { watchlist: [] }],
    ["appending to watchlist", { watchlist: arrayUnion({ id: 550, title: "Fight Club" }) }],
    ["deleting watchlist", { watchlist: deleteField() }],
    ["changing name", { name: "Mallory" }],
    ["changing friends", { friends: [] }],
  ])("modifying legacy fields is denied: %s", async (_label, patch) => {
    await assertFails(updateDoc(ref(), { ...patch, schemaVersion: 2, updatedAt: serverTimestamp() }));
  });

  test("overwriting the doc without merge (dropping legacy fields) is denied", async () => {
    await assertFails(setDoc(ref(), userData()));
  });
});
