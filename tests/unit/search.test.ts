import { dedupeMovies, diceSimilarity, foldText, movieMatchScore, normalizeQuery, rankByRelevance, searchVariants, titleMatchScore } from "@/src/lib/search";
import type { MovieSummary } from "@/src/types/movies";

const movie = (id: number, title: string, popularity = 10, originalTitle: string | null = null): MovieSummary => ({
  id,
  title,
  originalTitle,
  overview: "",
  posterPath: null,
  backdropPath: null,
  releaseDate: null,
  year: null,
  genreIds: [],
  voteAverage: 0,
  voteCount: 0,
  popularity,
  originalLanguage: null,
});

describe("query normalization", () => {
  it("trims, collapses whitespace and caps length", () => {
    expect(normalizeQuery("  the   matrix \n")).toBe("the matrix");
    expect(normalizeQuery("x".repeat(500))).toHaveLength(100);
  });
  it("folds accents, punctuation and ampersands", () => {
    expect(foldText("Amélie!")).toBe("amelie");
    expect(foldText("Spider-Man: Into the Spider-Verse")).toBe("spider man into the spider verse");
    expect(foldText("Fast & Furious")).toBe("fast and furious");
  });
});

describe("searchVariants", () => {
  it("truncates a misspelled long word so prefix matching recovers it", () => {
    expect(searchVariants("interstelar")).toContain("interst");
  });
  it("offers joined, numeral and article-free forms", () => {
    expect(searchVariants("spider man")).toContain("spiderman");
    expect(searchVariants("rocky 2")).toContain("rocky ii");
    expect(searchVariants("the godfater")).toContain("godfater");
  });
  it("never repeats the original query and limits the number of variants", () => {
    const variants = searchVariants("lord of the rigns");
    expect(variants).not.toContain("lord of the rigns");
    expect(variants.length).toBeLessThanOrEqual(3);
    expect(variants.some((v) => v.startsWith("lord of the rig"))).toBe(true);
  });
  it("returns nothing for empty input", () => {
    expect(searchVariants("   ")).toEqual([]);
  });
});

describe("similarity scoring", () => {
  it("scores identical strings 1 and unrelated strings low", () => {
    expect(diceSimilarity("Matrix", "matrix")).toBe(1);
    expect(diceSimilarity("Matrix", "Frozen")).toBeLessThan(0.2);
  });
  it("rewards prefixes, word matches and tolerates typos", () => {
    expect(titleMatchScore("godfath", "The Godfather")).toBeGreaterThanOrEqual(0.95);
    expect(titleMatchScore("reloaded", "The Matrix Reloaded")).toBeGreaterThanOrEqual(0.85);
    expect(titleMatchScore("interstelar", "Interstellar")).toBeGreaterThan(0.7);
    expect(titleMatchScore("interstelar", "Frozen Planet")).toBeLessThan(0.3);
  });
  it("also matches original titles", () => {
    expect(movieMatchScore("amelie", movie(1, "Amélie", 1, "Le Fabuleux Destin d'Amélie Poulain"))).toBe(1);
    expect(movieMatchScore("fabuleux", movie(1, "Amélie", 1, "Le Fabuleux Destin d'Amélie Poulain"))).toBeGreaterThan(0.8);
  });
});

describe("ranking and de-duplication", () => {
  it("removes duplicate ids keeping the first", () => {
    expect(dedupeMovies([movie(1, "A"), movie(2, "B"), movie(1, "A again")]).map((m) => m.title)).toEqual(["A", "B"]);
  });
  it("ranks the closest title first and drops weak matches", () => {
    const ranked = rankByRelevance("interstelar", [movie(1, "Interstate 60", 50), movie(2, "Interstellar", 40), movie(3, "Frozen", 99)], 0.45);
    expect(ranked[0].title).toBe("Interstellar");
    expect(ranked.map((m) => m.title)).not.toContain("Frozen");
  });
});
