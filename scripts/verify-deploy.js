#!/usr/bin/env node
/**
 * Checks a deployed eyelevel site end to end:
 *
 *   npm run verify:deploy -- https://your-domain.example
 *
 * Health and TMDB configuration, pages, movie data, security headers, static
 * asset caching, the 404 page, and whether the client bundle carries the
 * Firebase configuration. Exits with status 1 if a required check fails.
 */
const target = process.argv[2];
if (!target || !/^https?:\/\//.test(target)) {
  console.error("Usage: npm run verify:deploy -- https://your-domain.example");
  process.exit(2);
}
const base = target.replace(/\/+$/, "");
const results = [];

async function check(name, fn, { required = true } = {}) {
  try {
    const detail = await fn();
    results.push({ ok: true, name, detail });
  } catch (error) {
    results.push({ ok: false, required, name, detail: error.message });
  }
}

async function get(path, init) {
  const response = await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(20000), ...init });
  return response;
}

async function json(path) {
  const response = await get(path);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return { response, body: await response.json() };
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  let html = "";

  await check("API health, TMDB credential set on the server", async () => {
    const { body } = await json("/api/health");
    expect(body.ok === true, "health did not report ok");
    expect(body.tmdbConfigured === true, "TMDB_API_KEY / TMDB_READ_ACCESS_TOKEN is not set on the server");
    return "ok";
  });

  await check("Movie data from TMDB (genres, popular, search, details)", async () => {
    const genres = await json("/api/genres");
    expect(Array.isArray(genres.body.genres) && genres.body.genres.length > 5, "no genres");
    expect(genres.body.fallback !== true, "genre list is the built-in fallback: TMDB requests are failing (check the key)");
    const discover = await json("/api/movies/discover");
    expect(discover.body.results.length > 0, "discover returned no movies");
    const search = await json("/api/movies/search?q=inception");
    expect(search.body.results.length > 0, "search returned no movies");
    const details = await json("/api/movie/27205");
    expect(details.body.title, "movie details have no title");
    return `${discover.body.totalResults.toLocaleString()} popular movies; "${details.body.title}" details ok`;
  });

  await check("Home page", async () => {
    const response = await get("/");
    expect(response.status === 200, `HTTP ${response.status}`);
    expect((response.headers.get("content-type") || "").includes("text/html"), "not HTML");
    html = await response.text();
    expect(html.includes("<title>eyelevel</title>"), "unexpected page content");
    return "ok";
  });

  await check("Security headers", async () => {
    const response = await get("/");
    const h = (name) => response.headers.get(name) || "";
    expect(h("content-security-policy").includes("default-src 'self'"), "Content-Security-Policy missing");
    expect(!/script-src[^;]*'unsafe-(inline|eval)'/.test(h("content-security-policy")), "CSP allows unsafe scripts");
    expect(h("x-content-type-options") === "nosniff", "X-Content-Type-Options missing");
    expect(h("referrer-policy"), "Referrer-Policy missing");
    if (base.startsWith("https://")) expect(h("strict-transport-security"), "Strict-Transport-Security missing");
    const api = await get("/api/health");
    expect((api.headers.get("content-security-policy") || "").includes("default-src 'none'"), "API responses lack their CSP");
    return "CSP, nosniff, referrer policy" + (base.startsWith("https://") ? ", HSTS" : "");
  });

  await check("Pages and routing (movie page, sign-in, 404)", async () => {
    for (const path of ["/movie/27205", "/login", "/register"]) {
      const response = await get(path);
      expect(response.status === 200, `${path} returned HTTP ${response.status}`);
    }
    const missing = await get("/this-page-does-not-exist");
    expect(missing.status === 404, `unknown page returned HTTP ${missing.status}, expected 404`);
    return "ok";
  });

  await check("Static assets are cached long-term", async () => {
    const src = (html.match(/src="(\/_expo\/static\/js\/web\/entry-[^"]+\.js)"/) || [])[1];
    expect(src, "entry script not found in the home page");
    const response = await get(src);
    expect(response.status === 200, `${src} returned HTTP ${response.status}`);
    expect(/immutable|max-age=31536000/.test(response.headers.get("cache-control") || ""), "no long-term cache header");
    return src.split("/").pop();
  });

  await check(
    "Firebase configuration is in the client bundle (sign-in works)",
    async () => {
      const scripts = [...html.matchAll(/src="(\/_expo\/static\/js\/web\/[^"]+\.js)"/g)].map((m) => m[1]);
      for (const src of scripts) {
        const code = await (await get(src)).text();
        if (/\.firebaseapp\.com|firebasestorage\.app|\.web\.app/.test(code)) return "found";
      }
      throw new Error("no Firebase auth domain found: set the EXPO_PUBLIC_FIREBASE_* variables and redeploy");
    },
    { required: false },
  );

  let failed = 0;
  for (const r of results) {
    const mark = r.ok ? "✓" : r.required ? "✗" : "!";
    if (!r.ok && r.required) failed++;
    console.log(`${mark} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  console.log(failed ? `\n${failed} required check(s) failed for ${base}` : `\nAll required checks passed for ${base}`);
  process.exit(failed ? 1 : 0);
})();
