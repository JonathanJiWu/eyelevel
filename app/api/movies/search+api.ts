import { parseFilters } from "@/src/lib/filters";
import { MAX_QUERY_LENGTH } from "@/src/lib/search";
import { BadRequestError, CACHE, handle, json, parsePage } from "@/src/server/http";
import { searchMovies } from "@/src/server/movies";

/** Text search, optionally combined with filters: GET /api/movies/search?q=alien&yearFrom=1979&sort=rating */
export function GET(request: Request) {
  return handle(request, async (url) => {
    const query = url.searchParams.get("q") ?? "";
    if (query.length > MAX_QUERY_LENGTH * 2) throw new BadRequestError("Search query is too long.");
    const page = parsePage(url.searchParams.get("page"));
    const filters = parseFilters(url.searchParams, { strict: true });
    return json(await searchMovies(query, filters, page), { cache: CACHE.list });
  });
}
