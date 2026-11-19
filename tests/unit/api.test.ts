/**
 * API route tests: the real /api route handlers running against an
 * in-process mock TMDB server (scripts/mock-tmdb.js).
 */
import type { Server } from "http";
import type { AddressInfo } from "net";
import { GET as genresRoute } from "@/app/api/genres+api";
import { GET as healthRoute } from "@/app/api/health+api";
import { GET as languagesRoute } from "@/app/api/languages+api";
import { GET as detailsRoute } from "@/app/api/movie/[id]+api";
import { GET as discoverRoute } from "@/app/api/movies/discover+api";
import { GET as searchRoute } from "@/app/api/movies/search+api";
import { __resetRateLimits } from "@/src/server/http";
import { __tmdbInternals } from "@/src/server/tmdb";
import type { MovieDetails, MoviePage } from "@/src/types/movies";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startMockTmdb } = require("../../scripts/mock-tmdb.js") as { startMockTmdb: (port?: number) => Promise<Server> };

let server: Server;
let base: string;

const req = (path: string, headers: Record<string, string> = {}) => new Request(`http://localhost${path}`, { headers });
const json = async <T>(res: Response) => (await res.json()) as T;
const stats = async () => (await (await fetch(`${base}/__stats`)).json()) as { total: number; byPath: Record<string, number> };

beforeAll(async () => {
  server = await startMockTmdb(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(async () => {
  process.env.TMDB_API_BASE_URL = `${base}/3`;
  process.env.TMDB_API_KEY = "test-key";
  delete process.env.TMDB_READ_ACCESS_TOKEN;
  process.env.TMDB_MAX_RETRIES = "2";
  __tmdbInternals.clear();
  __resetRateLimits();
  await fetch(`${base}/__reset`);
});

describe("GET /api/movies/discover", () => {
  it("returns normalized, paginated movies", async () => {
    const res = await discoverRoute(req("/api/movies/discover"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage");
    const body = await json<MoviePage>(res);
    expect(body.page).toBe(1);
    expect(body.results).toHaveLength(20);
    expect(body.totalPages).toBeGreaterThan(1);
    const m = body.results[0];
    expect(Object.keys(m).sort()).toEqual(
      ["id", "title", "originalTitle", "overview", "posterPath", "backdropPath", "releaseDate", "year", "genreIds", "voteAverage", "voteCount", "popularity", "originalLanguage"].sort(),
    );
  });

  it("applies combined filters together", async () => {
    const res = await discoverRoute(req("/api/movies/discover?genres=16&language=ja&yearFrom=2000&yearTo=2010&ratingMin=8"));
    const body = await json<MoviePage>(res);
    expect(body.results.length).toBeGreaterThan(0);
    for (const m of body.results) {
      expect(m.genreIds).toContain(16);
      expect(m.originalLanguage).toBe("ja");
      expect(m.year).toBeGreaterThanOrEqual(2000);
      expect(m.year).toBeLessThanOrEqual(2010);
      expect(m.voteAverage).toBeGreaterThanOrEqual(8);
    }
  });

  it("supports genre AND/OR, runtime and certification filters", async () => {
    const any = await json<MoviePage>(await discoverRoute(req("/api/movies/discover?genres=16,878")));
    const all = await json<MoviePage>(await discoverRoute(req("/api/movies/discover?genres=16,878&genreMode=all")));
    expect(all.totalResults).toBeLessThan(any.totalResults);
    for (const m of all.results) expect(m.genreIds).toEqual(expect.arrayContaining([16, 878]));
    const kids = await json<MoviePage>(await discoverRoute(req("/api/movies/discover?certification=G&runtime=short")));
    expect(kids.results.map((m) => m.title)).toEqual(expect.arrayContaining(["Toy Story", "The Lion King"]));
  });

  it("sorts by title and paginates without overlap", async () => {
    const p1 = await json<MoviePage>(await discoverRoute(req("/api/movies/discover?sort=title&page=1")));
    const p2 = await json<MoviePage>(await discoverRoute(req("/api/movies/discover?sort=title&page=2")));
    const titles = p1.results.map((m) => m.title.toLowerCase());
    expect([...titles].sort()).toEqual(titles);
    const ids = new Set(p1.results.map((m) => m.id));
    expect(p2.results.some((m) => ids.has(m.id))).toBe(false);
  });

  it("rejects invalid input with 400", async () => {
    for (const q of ["page=0", "page=abc", "page=501", "yearFrom=1700", "ratingMin=20", "language=english", "sort=random"]) {
      const res = await discoverRoute(req(`/api/movies/discover?${q}`));
      expect(res.status).toBe(400);
      expect((await json<{ error: { code: string } }>(res)).error.code).toBe("invalid_request");
    }
  });
});

describe("GET /api/movies/search", () => {
  it("finds partial titles", async () => {
    const body = await json<MoviePage>(await searchRoute(req("/api/movies/search?q=godfath")));
    expect(body.mode).toBe("search");
    expect(body.results.map((m) => m.title)).toEqual(expect.arrayContaining(["The Godfather", "The Godfather Part II"]));
  });

  it("tolerates spelling mistakes", async () => {
    const body = await json<MoviePage>(await searchRoute(req("/api/movies/search?q=interstelar")));
    expect(body.fuzzy).toBe(true);
    expect(body.results[0].title).toBe("Interstellar");
  });

  it("handles accents and punctuation", async () => {
    const amelie = await json<MoviePage>(await searchRoute(req(`/api/movies/search?q=${encodeURIComponent("amelie")}`)));
    expect(amelie.results.map((m) => m.title)).toContain("Amélie");
    const spider = await json<MoviePage>(await searchRoute(req("/api/movies/search?q=spider-man")));
    expect(spider.results.map((m) => m.title)).toEqual(expect.arrayContaining(["Spider-Man", "Spider-Man: Into the Spider-Verse"]));
  });

  it("combines a text query with filters and sorting", async () => {
    const body = await json<MoviePage>(await searchRoute(req("/api/movies/search?q=the&genres=878&sort=newest")));
    expect(body.results.length).toBeGreaterThan(1);
    for (const m of body.results) expect(m.genreIds).toContain(878);
    const dates = body.results.map((m) => m.releaseDate ?? "");
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("reports browse-only filters as ignored during text search", async () => {
    const body = await json<MoviePage>(await searchRoute(req("/api/movies/search?q=matrix&runtime=short&certification=R")));
    expect(body.ignoredFilters).toEqual(["runtime", "certification"]);
    expect(body.results.map((m) => m.title)).toContain("The Matrix");
  });

  it("returns an empty page (not an error) when nothing matches", async () => {
    const res = await searchRoute(req("/api/movies/search?q=zzzzqqqq"));
    expect(res.status).toBe(200);
    expect((await json<MoviePage>(res)).results).toEqual([]);
  });

  it("rejects too-short and too-long queries", async () => {
    expect((await searchRoute(req("/api/movies/search?q=a"))).status).toBe(400);
    expect((await searchRoute(req(`/api/movies/search?q=${"x".repeat(250)}`))).status).toBe(400);
  });
});

describe("GET /api/movie/:id", () => {
  it("returns full details with credits, certification and recommendations", async () => {
    const res = await detailsRoute(req("/api/movie/27205"), { id: "27205" });
    expect(res.status).toBe(200);
    const m = await json<MovieDetails>(res);
    expect(m.title).toBe("Inception");
    expect(m.runtime).toBe(148);
    expect(m.certification).toBe("PG-13");
    expect(m.directors).toEqual(["Director of Inception"]);
    expect(m.cast.length).toBeGreaterThan(0);
    expect(m.genres.map((g) => g.name)).toContain("Science Fiction");
    expect(m.recommendations.every((r) => r.id !== 27205)).toBe(true);
  });

  it("maps upstream 404 to 404 and bad ids to 400", async () => {
    expect((await detailsRoute(req("/api/movie/999999"), { id: "999999" })).status).toBe(404);
    expect((await detailsRoute(req("/api/movie/abc"), { id: "abc" })).status).toBe(400);
    expect((await detailsRoute(req("/api/movie/0"), { id: "0" })).status).toBe(400);
  });
});

describe("reference data", () => {
  it("serves genres and languages (without the 'No Language' placeholder)", async () => {
    const genres = await json<{ genres: { id: number }[]; fallback: boolean }>(await genresRoute(req("/api/genres")));
    expect(genres.fallback).toBe(false);
    expect(genres.genres.length).toBe(19);
    const langs = await json<{ languages: { code: string }[] }>(await languagesRoute(req("/api/languages")));
    expect(langs.languages[0].code).toBe("en");
    expect(langs.languages.map((l) => l.code)).not.toContain("xx");
  });

  it("falls back to built-in genres when TMDB is unavailable", async () => {
    await fetch(`${base}/__fail`);
    process.env.TMDB_MAX_RETRIES = "0";
    const genres = await json<{ genres: unknown[]; fallback: boolean }>(await genresRoute(req("/api/genres")));
    expect(genres.fallback).toBe(true);
    expect(genres.genres.length).toBe(19);
  });
});

describe("caching, retries and failure handling", () => {
  it("caches identical requests and de-duplicates concurrent ones", async () => {
    await Promise.all([1, 2, 3].map(() => discoverRoute(req("/api/movies/discover?genres=18"))));
    await discoverRoute(req("/api/movies/discover?genres=18"));
    expect((await stats()).byPath["/3/discover/movie"]).toBe(1);
  });

  it("retries after a 429 using Retry-After", async () => {
    const started = Date.now();
    const res = await searchRoute(req("/api/movies/search?q=ratelimitonce"));
    expect(res.status).toBe(200);
    // Waited for Retry-After (1s) instead of failing; the query matches no
    // titles, so one extra spelling-variant search follows the retry.
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    expect((await stats()).byPath["/3/search/movie"]).toBe(3);
  });

  it("retries 5xx errors, then returns a clean 502", async () => {
    const res = await searchRoute(req("/api/movies/search?q=servererror"));
    expect(res.status).toBe(502);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe("upstream_unavailable");
    expect((await stats()).byPath["/3/search/movie"]).toBe(3);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("serves stale cached data when TMDB fails after the cache expired", async () => {
    const first = await json<MoviePage>(await discoverRoute(req("/api/movies/discover?genres=35")));
    await fetch(`${base}/__fail`);
    process.env.TMDB_MAX_RETRIES = "0";
    const realNow = Date.now;
    const spy = jest.spyOn(Date, "now").mockImplementation(() => realNow() + 60 * 60 * 1000);
    try {
      const res = await discoverRoute(req("/api/movies/discover?genres=35"));
      expect(res.status).toBe(200);
      expect((await json<MoviePage>(res)).results.map((m) => m.id)).toEqual(first.results.map((m) => m.id));
    } finally {
      spy.mockRestore();
    }
  });

  it("treats rejected credentials as a server misconfiguration (502), never exposing the key", async () => {
    process.env.TMDB_API_KEY = "wrong-key";
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await discoverRoute(req("/api/movies/discover?page=3"));
    errorSpy.mockRestore();
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toContain("upstream_auth");
    expect(text).not.toContain("wrong-key");
  });

  it("supports TMDB v4 read access tokens (Bearer auth)", async () => {
    delete process.env.TMDB_API_KEY;
    process.env.TMDB_READ_ACCESS_TOKEN = "test-token";
    expect((await discoverRoute(req("/api/movies/discover?page=4"))).status).toBe(200);
  });

  it("returns 503 when the server has no TMDB credentials", async () => {
    delete process.env.TMDB_API_KEY;
    const res = await discoverRoute(req("/api/movies/discover?page=5"));
    expect(res.status).toBe(503);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe("not_configured");
    const health = await json<{ tmdbConfigured: boolean }>(healthRoute());
    expect(health.tmdbConfigured).toBe(false);
  });

  it("rate-limits abusive clients per IP", async () => {
    const headers = { "x-forwarded-for": "203.0.113.7" };
    const statuses: number[] = [];
    for (let i = 0; i < 125; i++) statuses.push((await genresRoute(req("/api/genres", headers))).status);
    expect(statuses.filter((s) => s === 200).length).toBeGreaterThanOrEqual(120);
    const limited = await genresRoute(req("/api/genres", headers));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    // Other clients are unaffected.
    expect((await genresRoute(req("/api/genres", { "x-forwarded-for": "198.51.100.1" }))).status).toBe(200);
    // A spoofed first hop doesn't escape the limit: the proxy-appended last hop is used.
    expect((await genresRoute(req("/api/genres", { "x-forwarded-for": "1.2.3.4, 203.0.113.7" }))).status).toBe(429);
  });
});
