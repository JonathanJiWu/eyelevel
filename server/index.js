/**
 * Production server for any Node host (Render, Railway, Fly.io, Cloud Run,
 * a VPS, Docker...). Serves the static web build, the statically rendered
 * pages and the /api routes produced by `npx expo export -p web`.
 *
 *   npm run build:web && npm run serve
 *
 * Environment: PORT (default 3000), TMDB_API_KEY or TMDB_READ_ACCESS_TOKEN,
 * EXPO_DIST_DIR (default "dist").
 * (Vercel uses api/index.js instead; see DEPLOYMENT.md.)
 */
const path = require("path");
const fs = require("fs");
const express = require("express");
const compression = require("compression");
const { createRequestHandler } = require("expo-server/adapter/express");
const { cspResponseHook } = require("./csp");

const ROOT = path.join(__dirname, "..");
const DIST_DIR = path.resolve(ROOT, process.env.EXPO_DIST_DIR || "dist");
const CLIENT_DIR = path.join(DIST_DIR, "client");
const SERVER_DIR = path.join(DIST_DIR, "server");

if (!fs.existsSync(path.join(SERVER_DIR, "_expo", "routes.json"))) {
  console.error(`No build found in ${DIST_DIR}. Run \`npm run build:web\` first.`);
  process.exit(1);
}

process.env.NODE_ENV = "production";
const app = express();
app.disable("x-powered-by");
// Behind a load balancer / reverse proxy (needed for req.secure and client IPs).
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));
app.use(compression());

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

// Hashed bundles never change: cache for a year.
app.use("/_expo/static", express.static(path.join(CLIENT_DIR, "_expo", "static"), { immutable: true, maxAge: "1y", fallthrough: false, index: false }));
app.use(express.static(CLIENT_DIR, { maxAge: "1h", index: false }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));

// Pages (pre-rendered HTML, with a Content-Security-Policy) and /api/* routes.
app.all("*", createRequestHandler({ build: SERVER_DIR }, { beforeResponse: cspResponseHook(SERVER_DIR) }));

// Last-resort error handler: never leak stack traces.
app.use((error, _req, res, _next) => {
  const status = Number(error.status || error.statusCode) || 500;
  if (status < 500) {
    // e.g. a missing file under /_expo/static (express.static reports 404)
    if (!res.headersSent) res.status(status).json({ error: { code: status === 404 ? "not_found" : "invalid_request", message: status === 404 ? "Not found." : "Bad request." } });
    return;
  }
  console.error("[server] Unhandled error:", error);
  if (!res.headersSent) res.status(500).json({ error: { code: "internal_error", message: "Something went wrong on our side." } });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`eyelevel listening on http://localhost:${port}`);
  if (!process.env.TMDB_API_KEY && !process.env.TMDB_READ_ACCESS_TOKEN) {
    console.warn("WARNING: TMDB_API_KEY / TMDB_READ_ACCESS_TOKEN is not set; movie data endpoints will return 503.");
  }
});
