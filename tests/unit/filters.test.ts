import {
  countActiveFilters,
  defaultFilters,
  FilterValidationError,
  filtersToParams,
  hasActiveCriteria,
  matchesMovieFacts,
  needsMovieFacts,
  parseFilters,
  sameFilters,
  searchNeedsAggregation,
  toTmdbDiscoverParams,
} from "@/src/lib/filters";

describe("parseFilters / filtersToParams", () => {
  it("round-trips every filter through URL params", () => {
    const filters = {
      ...defaultFilters(),
      genres: [878, 28],
      genreMode: "all" as const,
      yearFrom: 1990,
      yearTo: 1999,
      ratingMin: 7,
      votesMin: 1000,
      language: "en",
      runtime: "medium" as const,
      certification: "PG-13",
      sort: "rating" as const,
    };
    const params = filtersToParams(filters);
    expect(params).toEqual({
      genres: "28,878",
      genreMode: "all",
      yearFrom: "1990",
      yearTo: "1999",
      ratingMin: "7",
      votesMin: "1000",
      language: "en",
      runtime: "medium",
      certification: "PG-13",
      sort: "rating",
    });
    const parsed = parseFilters(new URLSearchParams(params), { strict: true });
    expect(sameFilters(parsed, filters)).toBe(true);
  });

  it("omits defaults so clean URLs stay clean", () => {
    expect(filtersToParams(defaultFilters())).toEqual({});
  });

  it("strict mode rejects invalid values with helpful messages", () => {
    const bad: Record<string, string>[] = [
      { genres: "abc" },
      { genres: "1,2,3,4,5,6,7,8,9,10,11" },
      { yearFrom: "1700" },
      { yearFrom: "2000", yearTo: "1990" },
      { ratingMin: "11" },
      { votesMin: "-1" },
      { language: "eng" },
      { runtime: "huge" },
      { certification: "X" },
      { sort: "random" },
      { genreMode: "some" },
    ];
    for (const params of bad) {
      expect(() => parseFilters(new URLSearchParams(params), { strict: true })).toThrow(FilterValidationError);
    }
  });

  it("lenient mode drops invalid values and fixes swapped year ranges", () => {
    const parsed = parseFilters({ genres: "abc", yearFrom: "2010", yearTo: "2000", ratingMin: "7", sort: "nope" });
    expect(parsed.genres).toEqual([]);
    expect(parsed.yearFrom).toBe(2000);
    expect(parsed.yearTo).toBe(2010);
    expect(parsed.ratingMin).toBe(7);
    expect(parsed.sort).toBe("relevance");
  });

  it("de-duplicates genres and reads expo-router array params", () => {
    expect(parseFilters({ genres: ["28,28,12"] }).genres).toEqual([28, 12]);
  });
});

describe("filter state helpers", () => {
  it("counts active criteria (sort excluded)", () => {
    expect(countActiveFilters(defaultFilters())).toBe(0);
    expect(countActiveFilters({ ...defaultFilters(), genres: [1, 2], yearFrom: 2000, yearTo: 2001, language: "fr" })).toBe(3);
    expect(hasActiveCriteria({ ...defaultFilters(), sort: "newest" })).toBe(true);
    expect(hasActiveCriteria(defaultFilters())).toBe(false);
  });

  it("knows when text search must be aggregated server-side", () => {
    expect(searchNeedsAggregation(defaultFilters())).toBe(false);
    expect(searchNeedsAggregation({ ...defaultFilters(), genres: [18] })).toBe(true);
    expect(searchNeedsAggregation({ ...defaultFilters(), sort: "title" })).toBe(true);
    // Runtime and age rating also apply to text search (checked per movie).
    expect(searchNeedsAggregation({ ...defaultFilters(), runtime: "short" })).toBe(true);
    expect(searchNeedsAggregation({ ...defaultFilters(), certification: "R" })).toBe(true);
    expect(needsMovieFacts({ ...defaultFilters(), genres: [18], sort: "rating" })).toBe(false);
    expect(needsMovieFacts({ ...defaultFilters(), runtime: "long" })).toBe(true);
    expect(needsMovieFacts({ ...defaultFilters(), certification: "PG" })).toBe(true);
  });

  it("matches runtime buckets and age ratings; unknown values never match", () => {
    const f = (patch: Partial<ReturnType<typeof defaultFilters>>) => ({ ...defaultFilters(), ...patch });
    const movie = (runtime: number | null, certification: string | null = null) => ({ runtime, certification });
    expect(matchesMovieFacts(movie(89), f({ runtime: "short" }))).toBe(true);
    expect(matchesMovieFacts(movie(90), f({ runtime: "short" }))).toBe(false);
    expect(matchesMovieFacts(movie(90), f({ runtime: "medium" }))).toBe(true);
    expect(matchesMovieFacts(movie(150), f({ runtime: "medium" }))).toBe(true);
    expect(matchesMovieFacts(movie(151), f({ runtime: "medium" }))).toBe(false);
    expect(matchesMovieFacts(movie(151), f({ runtime: "long" }))).toBe(true);
    expect(matchesMovieFacts(movie(null), f({ runtime: "long" }))).toBe(false);
    expect(matchesMovieFacts(movie(null), f({}))).toBe(true);
    expect(matchesMovieFacts(movie(120, "PG-13"), f({ certification: "PG-13" }))).toBe(true);
    expect(matchesMovieFacts(movie(120, "PG"), f({ certification: "PG-13" }))).toBe(false);
    expect(matchesMovieFacts(movie(120, null), f({ certification: "R" }))).toBe(false);
    expect(matchesMovieFacts(movie(160, "R"), f({ runtime: "long", certification: "R" }))).toBe(true);
    expect(matchesMovieFacts(movie(100, "R"), f({ runtime: "long", certification: "R" }))).toBe(false);
  });
});

describe("toTmdbDiscoverParams", () => {
  it("maps combined filters to TMDB discover parameters", () => {
    const params = toTmdbDiscoverParams(
      { ...defaultFilters(), genres: [28, 12], genreMode: "any", yearFrom: 1990, yearTo: 1999, ratingMin: 7, language: "ja", runtime: "long", certification: "PG" },
      3,
    );
    expect(params).toMatchObject({
      include_adult: false,
      page: 3,
      sort_by: "popularity.desc",
      with_genres: "28|12",
      "primary_release_date.gte": "1990-01-01",
      "primary_release_date.lte": "1999-12-31",
      "vote_average.gte": 7,
      "vote_count.gte": 25,
      with_original_language: "ja",
      "with_runtime.gte": 151,
      certification_country: "US",
      certification: "PG",
    });
    expect(params["with_runtime.lte"]).toBeUndefined();
  });

  it("uses AND for 'match all genres'", () => {
    expect(toTmdbDiscoverParams({ ...defaultFilters(), genres: [28, 12], genreMode: "all" }, 1).with_genres).toBe("28,12");
  });

  it("adds vote floors so rating/oldest sorts aren't dominated by obscure titles", () => {
    expect(toTmdbDiscoverParams({ ...defaultFilters(), sort: "rating" }, 1)["vote_count.gte"]).toBe(200);
    expect(toTmdbDiscoverParams({ ...defaultFilters(), sort: "oldest" }, 1)["vote_count.gte"]).toBe(10);
    expect(toTmdbDiscoverParams({ ...defaultFilters(), sort: "rating", votesMin: 10000 }, 1)["vote_count.gte"]).toBe(10000);
  });

  it("caps 'newest' at today so unreleased placeholder entries are excluded", () => {
    const params = toTmdbDiscoverParams({ ...defaultFilters(), sort: "newest" }, 1);
    expect(params.sort_by).toBe("primary_release_date.desc");
    expect(params["primary_release_date.lte"]).toBe(new Date().toISOString().slice(0, 10));
    const past = toTmdbDiscoverParams({ ...defaultFilters(), sort: "newest", yearTo: 1980 }, 1);
    expect(past["primary_release_date.lte"]).toBe("1980-12-31");
  });
});
