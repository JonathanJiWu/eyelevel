#!/usr/bin/env node
/**
 * End-to-end test orchestrator.
 *
 * 1. Starts the mock TMDB API (scripts/mock-tmdb.js)
 * 2. Starts Firebase Auth + Firestore emulators (firebase.e2e.json, project demo-eyelevel)
 * 3. Builds the production web bundle configured for the emulators (dist-e2e/)
 * 4. Serves it with the production server (server/index.js)
 * 5. Runs Playwright (e2e/*.spec.ts) against it
 *
 * Usage: npm run test:e2e [-- <playwright args>]
 * Env:   SKIP_BUILD=1 reuses an existing dist-e2e build.
 */
const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const PORTS = { tmdb: 4010, auth: 9199, firestore: 8180, app: Number(process.env.E2E_PORT || 3200) };
const PROJECT = "demo-eyelevel";
const children = [];

function start(name, command, args, env = {}) {
  // detached: each service gets its own process group so shutdown can stop
  // grandchildren too (e.g. the Java Firestore emulator started by npx).
  const child = spawn(command, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const log = fs.createWriteStream(path.join(ROOT, "test-results", `${name}.log`));
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  children.push(child);
  child.on("exit", (code) => {
    if (code && code !== 0 && !shuttingDown) console.error(`[e2e] ${name} exited with code ${code} (see test-results/${name}.log)`);
  });
  return child;
}

async function waitFor(url, label, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${label} (${url})`);
}

let shuttingDown = false;
function shutdown(code) {
  shuttingDown = true;
  const signalAll = (signal) => {
    for (const child of [...children].reverse()) {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // already exited
      }
    }
  };
  signalAll("SIGINT");
  // Escalate if anything is still running (emulators can take a moment).
  setTimeout(() => signalAll("SIGKILL"), 5000);
  setTimeout(() => process.exit(code), 5500);
}
process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

async function main() {
  fs.mkdirSync(path.join(ROOT, "test-results"), { recursive: true });
  const publicEnv = {
    EXPO_PUBLIC_USE_FIREBASE_EMULATORS: "true",
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
    EXPO_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`,
    EXPO_PUBLIC_FIREBASE_APP_ID: "demo-app-id",
    EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: "127.0.0.1",
    EXPO_PUBLIC_AUTH_EMULATOR_PORT: String(PORTS.auth),
    EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT: String(PORTS.firestore),
    EXPO_PUBLIC_TMDB_IMAGE_BASE_URL: `http://127.0.0.1:${PORTS.tmdb}/img`,
  };

  if (process.env.SKIP_BUILD !== "1" || !fs.existsSync(path.join(ROOT, "dist-e2e", "server"))) {
    console.log("[e2e] Building web app for emulators…");
    const build = spawnSync("npx", ["expo", "export", "-p", "web", "--output-dir", "dist-e2e"], {
      cwd: ROOT,
      env: { ...process.env, ...publicEnv, CI: "1" },
      stdio: "inherit",
    });
    if (build.status !== 0) throw new Error("Web build failed");
  }
  // The CSP is derived from the public config (emulator and mock image origins here).
  const csp = spawnSync("node", ["server/csp.js", "--write", "dist-e2e"], { cwd: ROOT, env: { ...process.env, ...publicEnv }, stdio: "inherit" });
  if (csp.status !== 0) throw new Error("Writing the CSP failed");

  const isUp = async (url) => {
    try {
      return (await fetch(url)).status < 500;
    } catch {
      return false;
    }
  };
  console.log("[e2e] Starting mock TMDB, Firebase emulators and app server…");
  // Reuse services that are already running (handy when iterating locally).
  if (!(await isUp(`http://127.0.0.1:${PORTS.tmdb}/__stats`))) start("mock-tmdb", "node", ["scripts/mock-tmdb.js", String(PORTS.tmdb)]);
  if (!(await isUp(`http://127.0.0.1:${PORTS.auth}/`)) || !(await isUp(`http://127.0.0.1:${PORTS.firestore}/`))) {
    start("emulators", "npx", ["--yes", "firebase-tools@15.37.0", "emulators:start", "--config", "firebase.e2e.json", "--only", "auth,firestore", "--project", PROJECT]);
  }
  start("server", "node", ["server/index.js"], {
    PORT: String(PORTS.app),
    EXPO_DIST_DIR: "dist-e2e",
    TMDB_API_BASE_URL: `http://127.0.0.1:${PORTS.tmdb}/3`,
    TMDB_API_KEY: "test-key",
    // E2E drives many requests from one IP; keep the limiter out of the way.
    API_RATE_LIMIT_BURST: "100000",
    API_RATE_LIMIT_PER_SECOND: "100000",
  });

  await waitFor(`http://127.0.0.1:${PORTS.tmdb}/__stats`, "mock TMDB");
  await waitFor(`http://127.0.0.1:${PORTS.auth}/`, "Auth emulator");
  await waitFor(`http://127.0.0.1:${PORTS.firestore}/`, "Firestore emulator");
  await waitFor(`http://127.0.0.1:${PORTS.app}/healthz`, "app server");
  console.log("[e2e] Environment ready. Running Playwright…");

  const result = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
    cwd: ROOT,
    env: {
      ...process.env,
      E2E_BASE_URL: `http://127.0.0.1:${PORTS.app}`,
      E2E_AUTH_EMULATOR: `http://127.0.0.1:${PORTS.auth}`,
      E2E_FIRESTORE_EMULATOR: `http://127.0.0.1:${PORTS.firestore}`,
      E2E_TMDB: `http://127.0.0.1:${PORTS.tmdb}`,
      E2E_PROJECT: PROJECT,
    },
    stdio: "inherit",
  });
  shutdown(result.status ?? 1);
}

main().catch((error) => {
  console.error(`[e2e] ${error.message}`);
  shutdown(1);
});
