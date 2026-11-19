import { CACHE, handle, json, parseMovieId } from "@/src/server/http";
import { getMovieDetails } from "@/src/server/movies";

/** Full movie details: GET /api/movie/603 */
export function GET(request: Request, params: Record<string, string>) {
  return handle(request, async () => {
    const id = parseMovieId(params?.id);
    return json(await getMovieDetails(id), { cache: CACHE.details });
  });
}
