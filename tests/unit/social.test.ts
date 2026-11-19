import { Timestamp } from "firebase/firestore";
import type { LibraryEntry, Watchlist } from "@/src/data/types";
import { compareParticipants, participantFromLibrary, participantFromSharedIndex, popularAmongFriends, sharedSavedCount } from "@/src/lib/compare";
import { computeSharedIndex, sameSharedIndex, stableStringify } from "@/src/lib/sharedIndex";

const ts = (ms: number) => Timestamp.fromMillis(ms);
const list = (id: string, visibility: Watchlist["visibility"], name = id): Watchlist => ({
  id,
  name,
  description: "",
  visibility,
  createdAt: ts(1),
  updatedAt: ts(1000),
});
const entry = (movieId: number, listIds: string[], extra: Partial<LibraryEntry> = {}): LibraryEntry => ({
  movieId,
  title: `Movie ${movieId}`,
  posterPath: `/p${movieId}.jpg`,
  releaseDate: "2000-01-01",
  year: 2000,
  genreIds: [18, 35, 28, 12],
  voteAverage: 7,
  originalLanguage: "en",
  listIds,
  watched: false,
  watchedAt: null,
  rating: null,
  ratedAt: null,
  addedAt: ts(5),
  updatedAt: ts(5),
  ...extra,
});

describe("computeSharedIndex (what friends can see)", () => {
  const lists = [list("pub", "friends", "Shared"), list("priv", "private", "Secret")];

  it("includes only friends-visible lists and their movies", () => {
    const index = computeSharedIndex(lists, [entry(1, ["pub"]), entry(2, ["priv"]), entry(3, ["pub", "priv"])], { shareWatched: true, shareRatings: true });
    expect(Object.keys(index.lists)).toEqual(["pub"]);
    expect(index.lists.pub).toEqual({ n: "Shared", d: "", c: 2, u: 1000 });
    expect(Object.keys(index.movies).sort()).toEqual(["1", "3"]);
    // Private list ids never leak, even for movies that are also in a shared list.
    expect(index.movies["3"].l).toEqual(["pub"]);
    expect(JSON.stringify(index)).not.toContain("priv");
    expect(JSON.stringify(index)).not.toContain("Secret");
    expect(index.movies["1"].g).toEqual([18, 35, 28]);
  });

  it("shares watched status and ratings only when allowed", () => {
    const library = [entry(5, ["priv"], { watched: true, rating: 4 })];
    const shared = computeSharedIndex(lists, library, { shareWatched: true, shareRatings: true });
    expect(shared.movies["5"]).toMatchObject({ l: [], w: true, r: 4 });
    const hidden = computeSharedIndex(lists, library, { shareWatched: false, shareRatings: false });
    expect(hidden.movies["5"]).toBeUndefined();
    const watchedOnly = computeSharedIndex(lists, library, { shareWatched: true, shareRatings: false });
    expect(watchedOnly.movies["5"].r).toBeUndefined();
    expect(watchedOnly.movies["5"].w).toBe(true);
  });

  it("is deterministic so unchanged data never triggers rewrites", () => {
    const a = computeSharedIndex(lists, [entry(2, ["pub"]), entry(1, ["pub"])], { shareWatched: true, shareRatings: true });
    const b = computeSharedIndex([...lists].reverse(), [entry(1, ["pub"]), entry(2, ["pub"])], { shareWatched: true, shareRatings: true });
    expect(sameSharedIndex(a, b)).toBe(true);
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe('{"a":[2,{"d":1}],"b":1}');
  });
});

describe("watchlist comparison", () => {
  const me = participantFromLibrary("me", "Me", [entry(1, ["l"]), entry(2, ["l"]), entry(3, [], { watched: true, rating: 5 }), entry(4, ["l"], { rating: 3 })]);
  const alexIndex = computeSharedIndex(
    [list("a", "friends")],
    [entry(1, ["a"]), entry(4, ["a"], { rating: 5 }), entry(5, ["a"]), entry(3, [], { watched: true })],
    { shareWatched: true, shareRatings: true },
  );
  const samIndex = computeSharedIndex([list("s", "friends")], [entry(1, ["s"]), entry(5, ["s"])], { shareWatched: true, shareRatings: true });
  const alex = participantFromSharedIndex("alex", "Alex", alexIndex);
  const sam = participantFromSharedIndex("sam", "Sam", samIndex);

  it("finds movies both people want to watch and the differences", () => {
    const result = compareParticipants([me, alex]);
    expect(result.everyone.map((m) => m.movieId).sort()).toEqual([1, 4]);
    expect(result.onlyMine.map((m) => m.movieId)).toEqual([2]);
    expect(result.onlyTheirs.map((m) => m.movieId)).toEqual([5]);
    expect(result.watchedTogether.map((m) => m.movieId)).toEqual([3]);
    expect(result.ratedByBoth.map((m) => m.movieId)).toEqual([4]);
    expect(result.ratedByBoth[0].ratings).toEqual({ me: 3, alex: 5 });
    // 2 movies saved by both out of 4 saved by anyone.
    expect(result.matchScore).toBe(50);
    expect(sharedSavedCount(me, alex)).toBe(2);
  });

  it("supports group comparisons (3+ people)", () => {
    const result = compareParticipants([me, alex, sam]);
    expect(result.everyone.map((m) => m.movieId)).toEqual([1]);
    expect(result.some.map((m) => m.movieId).sort()).toEqual([4, 5]);
  });

  it("ranks movies popular among friends", () => {
    const popular = popularAmongFriends([alex, sam], 2);
    expect(popular.map((m) => m.movieId).sort()).toEqual([1, 5]);
    expect(popularAmongFriends([alex, sam], 2, new Set([1])).map((m) => m.movieId)).toEqual([5]);
  });

  it("handles a friend who has not shared anything", () => {
    const empty = participantFromSharedIndex("x", "X", null);
    const result = compareParticipants([me, empty]);
    expect(result.everyone).toEqual([]);
    expect(result.matchScore).toBe(0);
  });
});
