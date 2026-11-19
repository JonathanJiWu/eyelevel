import { expect, test, trackErrors, visible } from "./helpers";

test("home page renders popular movies without console errors", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Popular right now" })).toBeVisible();
  await expect(page.getByTestId("movie-grid").getByTestId(/^movie-card-/).first()).toBeVisible();
  await expect(visible(page.getByTestId("header-sign-in"))).toBeVisible();
  await page.screenshot({ path: "test-results/smoke-home.png" });
  expect(errors).toEqual([]);
});
