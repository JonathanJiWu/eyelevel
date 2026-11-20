/**
 * Rate limiting: the per-instance token bucket and the optional limit shared
 * by all instances (Redis over the Upstash REST API, faked here).
 */
import http from "http";
import type { AddressInfo } from "net";
import { handle } from "@/src/server/http";
import { __resetRateLimits } from "@/src/server/rateLimit";

/** Minimal Upstash REST stand-in: POST /pipeline with SET (EX/NX) and INCR. */
function startFakeRedis() {
  const store = new Map<string, { value: number; expiresAt: number }>();
  const state = { mode: "ok" as "ok" | "error" | "slow", keys: [] as string[], auth: [] as (string | undefined)[], requests: 0 };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      state.requests++;
      state.auth.push(req.headers.authorization);
      if (req.method !== "POST" || req.url !== "/pipeline" || state.mode === "error") {
        res.writeHead(500).end("unavailable");
        return;
      }
      const reply = () => {
        const now = Date.now();
        const results = (JSON.parse(body) as string[][]).map(([command, key, ...args]) => {
          state.keys.push(key);
          const entry = store.get(key);
          const live = entry && entry.expiresAt > now ? entry : undefined;
          if (command === "SET") {
            if (live && args.includes("NX")) return { result: null };
            store.set(key, { value: Number(args[0]), expiresAt: now + Number(args[args.indexOf("EX") + 1]) * 1000 });
            return { result: "OK" };
          }
          if (command === "INCR") {
            const value = (live?.value ?? 0) + 1;
            store.set(key, { value, expiresAt: live?.expiresAt ?? Number.POSITIVE_INFINITY });
            return { result: value };
          }
          return { error: `ERR unknown command '${command}'` };
        });
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(results));
      };
      if (state.mode === "slow") setTimeout(reply, 1500);
      else reply();
    });
  });
  return new Promise<{ server: http.Server; url: string; state: typeof state; store: typeof store }>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, state, store })),
  );
}

const ENV_KEYS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "API_RATE_LIMIT_BURST",
  "API_RATE_LIMIT_PER_SECOND",
  "API_RATE_LIMIT_PER_WINDOW",
  "API_RATE_LIMIT_WINDOW_SECONDS",
  "API_RATE_LIMIT_TIMEOUT_MS",
];

const call = (ip: string) =>
  handle(new Request("http://localhost/api/health", { headers: { "x-forwarded-for": ip } }), async () => new Response("ok"));

let redis: Awaited<ReturnType<typeof startFakeRedis>>;

beforeAll(async () => {
  redis = await startFakeRedis();
});

afterAll(() => new Promise<void>((resolve) => redis.server.close(() => resolve())));

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  redis.state.mode = "ok";
  redis.state.keys = [];
  redis.state.auth = [];
  redis.state.requests = 0;
  redis.store.clear();
  __resetRateLimits();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("per-instance token bucket", () => {
  it("rejects bursts beyond the bucket size with Retry-After", async () => {
    process.env.API_RATE_LIMIT_BURST = "3";
    process.env.API_RATE_LIMIT_PER_SECOND = "0.5";
    for (let i = 0; i < 3; i++) expect((await call("198.51.100.1")).status).toBe(200);
    const limited = await call("198.51.100.1");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(((await limited.json()) as { error: { code: string } }).error.code).toBe("rate_limited");
    // Other clients are unaffected.
    expect((await call("198.51.100.2")).status).toBe(200);
    // Without Redis configured nothing is sent anywhere.
    expect(redis.state.requests).toBe(0);
  });
});

describe("shared limit across instances", () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = redis.url;
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    process.env.API_RATE_LIMIT_PER_WINDOW = "5";
    process.env.API_RATE_LIMIT_WINDOW_SECONDS = "60";
  });

  it("counts requests from every instance in one window", async () => {
    for (let i = 0; i < 3; i++) expect((await call("203.0.113.7")).status).toBe(200);
    // A different server instance: its local bucket is fresh, the shared count is not.
    __resetRateLimits();
    for (let i = 0; i < 2; i++) expect((await call("203.0.113.7")).status).toBe(200);
    const limited = await call("203.0.113.7");
    expect(limited.status).toBe(429);
    const retryAfter = Number(limited.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect((await call("203.0.113.8")).status).toBe(200);
  });

  it("authenticates, and stores only hashed client addresses that expire", async () => {
    await call("203.0.113.7");
    expect(redis.state.auth).toEqual(["Bearer test-token"]);
    expect(redis.state.keys.length).toBeGreaterThan(0);
    for (const key of redis.state.keys) {
      expect(key).not.toContain("203.0.113.7");
      expect(key).toMatch(/^eyelevel:rl:[0-9a-f]{32}:\d+$/);
    }
    for (const entry of redis.store.values()) expect(entry.expiresAt).toBeLessThanOrEqual(Date.now() + 61_000);
  });

  it("accepts the Vercel KV variable names", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.KV_REST_API_URL = redis.url;
    process.env.KV_REST_API_TOKEN = "kv-token";
    await call("203.0.113.9");
    expect(redis.state.auth).toEqual(["Bearer kv-token"]);
  });

  it("fails open when Redis errors", async () => {
    redis.state.mode = "error";
    for (let i = 0; i < 8; i++) expect((await call("203.0.113.7")).status).toBe(200);
    expect(console.warn).toHaveBeenCalledTimes(1); // warned once, not per request
  });

  it("fails open quickly when Redis is slow", async () => {
    redis.state.mode = "slow";
    process.env.API_RATE_LIMIT_TIMEOUT_MS = "100";
    const started = Date.now();
    expect((await call("203.0.113.7")).status).toBe(200);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("fails open when Redis is unreachable", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "http://127.0.0.1:9"; // nothing listens there
    expect((await call("203.0.113.7")).status).toBe(200);
  });
});
