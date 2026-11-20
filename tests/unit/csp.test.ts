/**
 * Content-Security-Policy generation (server/csp.js).
 */
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const csp = require("../../server/csp.js") as {
  buildDirectives: (env: Record<string, string>, serverDir: string) => Record<string, string[]>;
  serialize: (directives: Record<string, string[]>) => string;
  loadPolicy: (serverDir: string, env?: Record<string, string>) => string;
  cspResponseHook: (
    serverDir: string,
    env?: Record<string, string>,
  ) => (init: { headers: Headers }, route: { type: string | null }) => { headers: Headers };
};

let dir: string;
const INLINE = "globalThis.__EXPO_ROUTER_HYDRATE__=true;";
const sha = (body: string) => `'sha256-${crypto.createHash("sha256").update(body).digest("base64")}'`;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "csp-"));
  fs.mkdirSync(path.join(dir, "movie"));
  fs.writeFileSync(path.join(dir, "index.html"), `<html><head><script src="/_expo/static/js/web/entry.js" defer></script></head><body><script id="_R_">${INLINE}</script></body></html>`);
  fs.writeFileSync(path.join(dir, "movie", "[id].html"), `<html><body><script>${INLINE}</script><script type="application/ld+json">{"a":1}</script></body></html>`);
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("buildDirectives", () => {
  it("allows only the app's own scripts, hashed inline scripts and the services it uses", () => {
    const d = csp.buildDirectives({}, dir);
    expect(d["script-src"]).toEqual(["'self'", sha(INLINE)]);
    expect(d["script-src"].join(" ")).not.toMatch(/unsafe-(inline|eval)/);
    expect(d["img-src"]).toEqual(["'self'", "data:", "blob:", "https://image.tmdb.org"]);
    expect(d["connect-src"]).toEqual([
      "'self'",
      "https://firestore.googleapis.com",
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
    ]);
    expect(d["frame-src"]).toEqual(["'none'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["frame-ancestors"]).toEqual(["'self'"]);
  });

  it("adds Google sign-in, App Check, emulator and extra origins only when configured", () => {
    const d = csp.buildDirectives(
      {
        EXPO_PUBLIC_ENABLE_GOOGLE_SIGN_IN: "true",
        EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "example-project.firebaseapp.com",
        EXPO_PUBLIC_FIREBASE_APPCHECK_SITE_KEY: "site-key",
        EXPO_PUBLIC_USE_FIREBASE_EMULATORS: "true",
        EXPO_PUBLIC_AUTH_EMULATOR_PORT: "9199",
        EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT: "8180",
        EXPO_PUBLIC_TMDB_IMAGE_BASE_URL: "http://127.0.0.1:4010/img",
        CSP_EXTRA_CONNECT_SRC: "https://logs.example.com https://metrics.example.com",
      },
      dir,
    );
    expect(d["script-src"]).toEqual(expect.arrayContaining(["https://apis.google.com", "https://www.google.com/recaptcha/"]));
    expect(d["frame-src"]).toEqual(expect.arrayContaining(["https://example-project.firebaseapp.com", "https://www.google.com/recaptcha/"]));
    expect(d["connect-src"]).toEqual(
      expect.arrayContaining([
        "http://127.0.0.1:9199",
        "http://127.0.0.1:8180",
        "https://content-firebaseappcheck.googleapis.com",
        "https://logs.example.com",
        "https://metrics.example.com",
      ]),
    );
    expect(d["img-src"]).toContain("http://127.0.0.1:4010");
  });
});

describe("cspResponseHook", () => {
  const init = (contentType: string) => ({ headers: new Headers({ "Content-Type": contentType }) });

  it("adds the page policy to HTML (including 404 pages) and a deny-all policy to API responses", () => {
    const hook = csp.cspResponseHook(dir, {});
    const page = hook(init("text/html"), { type: "html" }).headers.get("content-security-policy");
    expect(page).toBe(csp.serialize(csp.buildDirectives({}, dir)));
    expect(hook(init("text/html"), { type: "notFoundHtml" }).headers.get("content-security-policy")).toBe(page);
    expect(hook(init("application/json"), { type: "api" }).headers.get("content-security-policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });

  it("supports report-only mode, a report URI, and switching the header off", () => {
    const reportOnly = csp.cspResponseHook(dir, { CSP_REPORT_ONLY: "true", CSP_REPORT_URI: "https://r.example/csp" });
    const headers = reportOnly(init("text/html"), { type: "html" }).headers;
    expect(headers.get("content-security-policy")).toBeNull();
    expect(headers.get("content-security-policy-report-only")).toMatch(/; report-uri https:\/\/r\.example\/csp$/);
    const off = csp.cspResponseHook(dir, { CSP_DISABLED: "true" });
    expect(off(init("text/html"), { type: "html" }).headers.get("content-security-policy")).toBeNull();
  });

  it("prefers the policy written at build time", () => {
    fs.mkdirSync(path.join(dir, "_eyelevel"), { recursive: true });
    fs.writeFileSync(path.join(dir, "_eyelevel", "csp.json"), JSON.stringify({ policy: "default-src 'self'; img-src https://cdn.example" }));
    try {
      expect(csp.loadPolicy(dir, { EXPO_PUBLIC_ENABLE_GOOGLE_SIGN_IN: "true" })).toBe("default-src 'self'; img-src https://cdn.example");
    } finally {
      fs.rmSync(path.join(dir, "_eyelevel"), { recursive: true, force: true });
    }
  });
});
