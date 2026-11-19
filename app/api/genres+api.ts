import { CACHE, handle, json } from "@/src/server/http";
import { getGenres } from "@/src/server/movies";

export function GET(request: Request) {
  return handle(request, async () => {
    const { genres, fallback } = await getGenres();
    return json({ genres, fallback }, { cache: fallback ? CACHE.list : CACHE.reference });
  });
}
