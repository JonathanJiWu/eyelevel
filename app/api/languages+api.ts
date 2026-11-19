import { CACHE, handle, json } from "@/src/server/http";
import { getLanguages } from "@/src/server/movies";

export function GET(request: Request) {
  return handle(request, async () => {
    const { languages, fallback } = await getLanguages();
    return json({ languages, fallback }, { cache: fallback ? CACHE.list : CACHE.reference });
  });
}
