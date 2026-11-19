import { expect, test, trackErrors } from "./helpers";

const card = (page: import("@playwright/test").Page, title: string) =>
  page.getByTestId("movie-grid").getByRole("link", { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(,|$)`) });

test.describe("discovery", () => {
  test("search is debounced, matches partial titles, tolerates typos and handles no results", async ({ page }) => {
    const errors = trackErrors(page);
    const searches: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/movies/search")) searches.push(new URL(r.url()).searchParams.get("q") ?? "");
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Popular right now" })).toBeVisible();

    await page.getByTestId("search-input").pressSequentially("godfath", { delay: 60 });
    await expect(page.getByRole("heading", { name: "Results for “godfath”" })).toBeVisible();
    await expect(card(page, "The Godfather")).toBeVisible();
    await expect(card(page, "The Godfather Part II")).toBeVisible();
    // Typing 7 characters produced at most a couple of API calls, not one per keystroke.
    expect(searches.length).toBeLessThanOrEqual(2);
    await expect(page).toHaveURL(/q=godfath/);

    // Suggestions dropdown navigates straight to a movie.
    await page.getByTestId("search-input").click();
    await page.getByTestId("search-suggestions").getByRole("link", { name: /The Godfather Part II/ }).click();
    await expect(page.getByTestId("movie-title")).toHaveText("The Godfather Part II");
    await page.goBack();

    await page.getByTestId("search-input").fill("interstelar");
    await expect(page.getByText(/Few exact matches for “interstelar”/)).toBeVisible();
    await expect(card(page, "Interstellar")).toBeVisible();

    await page.getByTestId("search-input").fill("zzzzqqqq");
    await expect(page.getByTestId("discover-empty")).toBeVisible();

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByRole("heading", { name: "Popular right now" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("filters combine, persist in the URL across reloads and can be reset", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("open-filters").click();
    const sheet = page.getByTestId("filter-sheet");
    await sheet.getByTestId("genre-16").click();
    await sheet.getByTestId("language-ja").click();
    await sheet.getByTestId("rating-8").click();
    await sheet.getByTestId("year-from").fill("2000");
    await sheet.getByTestId("year-to").fill("2010");
    await sheet.getByTestId("filters-apply").click();

    await expect(page).toHaveURL(/genres=16/);
    await expect(page).toHaveURL(/language=ja/);
    await expect(page).toHaveURL(/ratingMin=8/);
    await expect(page).toHaveURL(/yearFrom=2000/);
    await expect(card(page, "Spirited Away")).toBeVisible();
    await expect(card(page, "Howl's Moving Castle")).toBeVisible();
    await expect(card(page, "Your Name.")).toHaveCount(0); // 2016 is outside the year range
    await expect(page.getByTestId("open-filters")).toHaveText(/Filters \(4\)/);

    await page.reload();
    await expect(page.getByTestId("active-filters")).toContainText("Animation");
    await expect(page.getByTestId("active-filters")).toContainText("2000–2010");
    await expect(card(page, "Spirited Away")).toBeVisible();

    // Remove one criterion: widen the years, "Your Name." appears.
    await page.getByRole("button", { name: "Remove filter 2000–2010" }).click();
    await expect(card(page, "Your Name.")).toBeVisible();
    await expect(page).not.toHaveURL(/yearFrom/);

    // Filters also work together with a text query.
    await page.getByTestId("search-input").fill("spirited");
    await expect(card(page, "Spirited Away")).toBeVisible();
    await page.getByTestId("search-input").fill("");

    await page.getByTestId("filters-clear-all").click();
    await expect(page.getByRole("heading", { name: "Popular right now" })).toBeVisible();
    await expect(page).not.toHaveURL(/genres=/);
  });

  test("infinite scroll loads further pages without duplicates", async ({ page }) => {
    await page.goto("/");
    const cards = page.getByTestId("movie-grid").getByTestId(/^movie-card-/);
    await expect(cards.first()).toBeVisible();
    const initial = await cards.count();
    expect(initial).toBe(20);
    for (let i = 0; i < 6 && (await cards.count()) <= 40; i++) {
      await page.getByTestId("movie-grid").evaluate((el) => {
        const scroller = [el, ...el.querySelectorAll("*")].find((n) => n.scrollHeight > n.clientHeight + 10 && getComputedStyle(n).overflowY !== "visible");
        (scroller ?? el).scrollTop = 1e9;
      });
      await page.waitForTimeout(500);
    }
    await expect.poll(() => cards.count()).toBeGreaterThan(40);
    const ids = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("API failures show a recoverable error state", async ({ page }) => {
    await page.route("**/api/movies/discover**", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "upstream_unavailable", message: "The movie database is having problems right now." } }) }),
    );
    await page.goto("/");
    await expect(page.getByText("The movie database is having problems right now.")).toBeVisible();
    await page.unroute("**/api/movies/discover**");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("movie-grid").getByTestId(/^movie-card-/).first()).toBeVisible();
  });

  test("movie details show full metadata; unknown movies show not-found", async ({ page }) => {
    await page.goto("/movie/27205");
    await expect(page.getByTestId("movie-title")).toHaveText("Inception");
    await expect(page.getByText("2010 · PG-13 · 2h 28m · English".replace(/ · /g, "  ·  "))).toBeVisible();
    await expect(page.getByText("Director of Inception")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cast" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "More like this" })).toBeVisible();
    // Signed-out users are sent to sign in when trying to save.
    await page.getByTestId("save-movie").click();
    await expect(page).toHaveURL(/\/login\?redirect=/);

    await page.goto("/movie/999999");
    await expect(page.getByText("Movie not found")).toBeVisible();
    await page.goto("/movie/not-a-number");
    await expect(page.getByText("Movie not found")).toBeVisible();
  });
});
