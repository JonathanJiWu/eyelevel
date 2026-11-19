import { parseFilters } from "@/src/lib/filters";
import { CACHE, handle, json, parsePage } from "@/src/server/http";
import { discoverMovies } from "@/src/server/movies";

/** Browse movies with combinable filters: GET /api/movies/discover?genres=28,12&yearFrom=1990&sort=rating&page=2 */
export function GET(request: Request) {
  return handle(request, async (url) => {
    const page = parsePage(url.searchParams.get("page"));
    const filters = parseFilters(url.searchParams, { strict: true });
    return json(await discoverMovies(filters, page), { cache: CACHE.list });
  });
}
