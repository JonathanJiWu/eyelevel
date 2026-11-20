/**
 * Content-Security-Policy for the web app's HTML responses.
 *
 * The policy only allows what the app loads: its own scripts (plus hashes of
 * the inline scripts in the statically rendered HTML), images from the TMDB
 * CDN, and the Firebase services the client talks to. Google sign-in and
 * App Check add their Google origins only when they are enabled.
 *
 * The policy is computed at build time, from the same EXPO_PUBLIC_* values
 * that configure the client bundle, and saved next to the build:
 *
 *   node server/csp.js --write dist      (part of `npm run build:web`)
 *
 * The servers load it from <dist>/server/_eyelevel/csp.json; when the file is
 * missing they compute it from the runtime environment instead.
 *
 * Runtime environment (optional):
 *   CSP_REPORT_ONLY=true   send Content-Security-Policy-Report-Only (try a policy out)
 *   CSP_REPORT_URI=<url>   add a report-uri directive
 *   CSP_DISABLED=true      send no CSP header at all
 * Build-time environment (optional), space-separated sources added to a directive:
 *   CSP_EXTRA_CONNECT_SRC, CSP_EXTRA_IMG_SRC, CSP_EXTRA_SCRIPT_SRC, CSP_EXTRA_FRAME_SRC
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MANIFEST = path.join("_eyelevel", "csp.json");

function originOf(url) {
  try {
    const { protocol, host } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? `${protocol}//${host}` : null;
  } catch {
    return null;
  }
}

const list = (value) => (value || "").split(/\s+/).filter(Boolean);

function htmlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

/** sha256 sources for every inline <script> in the exported HTML. */
function inlineScriptHashes(serverDir) {
  const hashes = new Set();
  for (const file of htmlFiles(serverDir)) {
    const html = fs.readFileSync(file, "utf8");
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const [, attributes, body] = match;
      if (/\bsrc\s*=/i.test(attributes) || !body) continue;
      if (/\btype\s*=\s*["']?application\/(ld\+)?json/i.test(attributes)) continue; // data, not script
      hashes.add(`'sha256-${crypto.createHash("sha256").update(body, "utf8").digest("base64")}'`);
    }
  }
  return [...hashes].sort();
}

/** Directives for the app's pages, derived from the public client configuration. */
function buildDirectives(env, serverDir) {
  const script = ["'self'", ...inlineScriptHashes(serverDir)];
  const connect = [
    "'self'",
    "https://firestore.googleapis.com",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
  ];
  const img = ["'self'", "data:", "blob:", originOf(env.EXPO_PUBLIC_TMDB_IMAGE_BASE_URL || "https://image.tmdb.org/t/p")];
  const frame = [];

  if (env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
    const host = env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1";
    connect.push(`http://${host}:${env.EXPO_PUBLIC_AUTH_EMULATOR_PORT || 9099}`);
    connect.push(`http://${host}:${env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080}`);
  }
  if (env.EXPO_PUBLIC_ENABLE_GOOGLE_SIGN_IN === "true") {
    // Firebase's popup sign-in loads Google's API loader and talks to the
    // project's auth domain through a hidden iframe.
    script.push("https://apis.google.com");
    connect.push("https://www.googleapis.com");
    const authDomain = env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
    if (authDomain) frame.push(`https://${authDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`);
    frame.push("https://accounts.google.com");
  }
  if (env.EXPO_PUBLIC_FIREBASE_APPCHECK_SITE_KEY) {
    // App Check with reCAPTCHA v3 / Enterprise.
    script.push("https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/");
    frame.push("https://www.google.com/recaptcha/", "https://recaptcha.google.com/recaptcha/");
    connect.push("https://content-firebaseappcheck.googleapis.com", "https://www.google.com/recaptcha/");
  }
  script.push(...list(env.CSP_EXTRA_SCRIPT_SRC));
  connect.push(...list(env.CSP_EXTRA_CONNECT_SRC));
  img.push(...list(env.CSP_EXTRA_IMG_SRC));
  frame.push(...list(env.CSP_EXTRA_FRAME_SRC));

  const unique = (sources) => [...new Set(sources.filter(Boolean))];
  return {
    "default-src": ["'self'"],
    "script-src": unique(script),
    // React Native Web and Expo inject style elements and style attributes.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": unique(img),
    "font-src": ["'self'", "data:"],
    "connect-src": unique(connect),
    "frame-src": frame.length ? unique(frame) : ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'"],
  };
}

const serialize = (directives) =>
  Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");

/** Policy for the build in `serverDir` (dist/server), from the build manifest or the environment. */
function loadPolicy(serverDir, env = process.env) {
  const manifest = path.join(serverDir, MANIFEST);
  if (fs.existsSync(manifest)) return JSON.parse(fs.readFileSync(manifest, "utf8")).policy;
  return serialize(buildDirectives(env, serverDir));
}

/**
 * `beforeResponse` hook for expo-server's createRequestHandler: adds the CSP
 * to HTML responses, and a deny-all policy to API (JSON) responses.
 */
function cspResponseHook(serverDir, env = process.env) {
  if (env.CSP_DISABLED === "true") return (init) => init;
  const header = env.CSP_REPORT_ONLY === "true" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
  const report = env.CSP_REPORT_URI ? `; report-uri ${env.CSP_REPORT_URI}` : "";
  const pagePolicy = loadPolicy(serverDir, env) + report;
  const apiPolicy = "default-src 'none'; frame-ancestors 'none'";
  return (init, route) => {
    const type = route && route.type;
    const contentType = init.headers.get("content-type") || "";
    if (type === "html" || type === "notFoundHtml" || contentType.includes("text/html")) init.headers.set(header, pagePolicy);
    else if (!init.headers.has("content-security-policy")) init.headers.set("Content-Security-Policy", apiPolicy);
    return init;
  };
}

module.exports = { buildDirectives, serialize, loadPolicy, cspResponseHook, inlineScriptHashes };

// CLI: node server/csp.js --write <distDir>
if (require.main === module) {
  const index = process.argv.indexOf("--write");
  const distDir = path.resolve(index > -1 && process.argv[index + 1] ? process.argv[index + 1] : "dist");
  const serverDir = path.join(distDir, "server");
  if (!fs.existsSync(serverDir)) {
    console.error(`[csp] No server build in ${distDir}. Run \`npx expo export -p web\` first.`);
    process.exit(1);
  }
  const policy = serialize(buildDirectives(process.env, serverDir));
  fs.mkdirSync(path.join(serverDir, "_eyelevel"), { recursive: true });
  fs.writeFileSync(path.join(serverDir, MANIFEST), JSON.stringify({ policy }, null, 2) + "\n");
  console.log(`[csp] Wrote ${path.relative(process.cwd(), path.join(serverDir, MANIFEST))}`);
}
