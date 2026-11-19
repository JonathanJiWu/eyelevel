import { tmdbImageBaseUrl } from "@/src/config/env";

export type PosterSize = "w92" | "w154" | "w185" | "w342" | "w500" | "w780";
export type BackdropSize = "w300" | "w780" | "w1280";
export type ProfileSize = "w45" | "w185";

/** Public TMDB image CDN URL (no credentials needed). */
export function tmdbImage(path: string | null | undefined, size: PosterSize | BackdropSize | ProfileSize): string | null {
  if (!path || !path.startsWith("/")) return null;
  return `${tmdbImageBaseUrl}/${size}${path}`;
}
