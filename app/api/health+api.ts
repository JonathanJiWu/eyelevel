import { json } from "@/src/server/http";
import { isTmdbConfigured } from "@/src/server/tmdb";

/** Liveness/config probe used by deployment checks. Exposes no secrets. */
export function GET() {
  return json({ ok: true, tmdbConfigured: isTmdbConfigured(), time: new Date().toISOString() });
}
