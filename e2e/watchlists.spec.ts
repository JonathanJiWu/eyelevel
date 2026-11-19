import { addToLists, expect, register, signIn, signOut, test, toast, trackErrors, uniqueUser } from "./helpers";

const INTERSTELLAR = 157336;
const INCEPTION = 27205;
const MATRIX = 603;

test("watchlists: create, add, organize, rate, persist and delete", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackErrors(page);
  const user = uniqueUser("lists");
  await register(page, user);

  // A default "Watchlist" exists for new accounts.
  await page.goto("/lists");
  await expect(page.getByTestId("list-card-Watchlist")).toContainText("0 movies");

  // Quick add from Discover.
  await page.goto("/");
  await page.getByTestId("search-input").fill("interstellar");
  await page.getByTestId(`quick-add-${INTERSTELLAR}`).click();
  await expect(toast(page)).toContainText('Added "Interstellar" to Watchlist');
  await expect(page.getByTestId(`quick-add-${INTERSTELLAR}`)).toHaveAttribute("aria-label", /is in your lists/);

  // Create a private list.
  await page.goto("/lists");
  await page.getByTestId("create-list").click();
  const editor = page.getByTestId("list-editor");
  await editor.getByTestId("list-editor-submit").click();
  await expect(editor.getByText("Give your list a name.")).toBeVisible();
  await editor.getByTestId("list-name-input").fill("Date night");
  await editor.getByTestId("list-description-input").fill("Cozy picks");
  await editor.getByTestId("visibility-private").click();
  await editor.getByTestId("list-editor-submit").click();
  await expect(page.getByTestId("list-title")).toHaveText("Date night");
  await expect(page.getByTestId("list-visibility")).toContainText("Private");

  // Duplicate names are rejected.
  await page.goto("/lists");
  await page.getByTestId("create-list").click();
  await page.getByTestId("list-name-input").fill("date NIGHT");
  await page.getByTestId("list-editor-submit").click();
  await expect(page.getByText("You already have a list with that name.")).toBeVisible();
  await page.keyboard.press("Escape");

  // Add movies to several lists from the detail page; create a list inline.
  await addToLists(page, INCEPTION, ["Watchlist", "Date night"]);
  await expect(page.getByText("Saved in: Watchlist, Date night")).toBeVisible();
  await page.goto(`/movie/${MATRIX}`);
  await page.getByTestId("choose-lists").click();
  await page.getByTestId("list-picker-new").click();
  await page.getByTestId("new-list-name").fill("Classics");
  await page.getByTestId("list-picker-save").click();
  await expect(page.getByTestId("list-picker")).toBeHidden();
  await expect(page.getByText("Saved in: Classics")).toBeVisible();

  // Rate and mark watched.
  await page.goto(`/movie/${INCEPTION}`);
  await page.getByTestId("rate-4").click();
  await expect(page.getByLabel("Rated 4 of 5")).toBeVisible();
  await page.getByTestId("toggle-watched").click();
  await expect(page.getByTestId("toggle-watched")).toHaveText(/Watched/);

  // Organize inside a list.
  await page.goto("/lists");
  await expect(page.getByTestId("list-card-Watchlist")).toContainText("2 movies");
  await page.getByTestId("list-card-Watchlist").click();
  await expect(page.getByTestId(`list-item-${INTERSTELLAR}`)).toBeVisible();
  await expect(page.getByTestId(`list-item-${INCEPTION}`)).toContainText("Watched");
  await page.getByRole("tab", { name: /Watched \(1\)/ }).click();
  await expect(page.getByTestId(`list-item-${INTERSTELLAR}`)).toHaveCount(0);
  await page.getByRole("tab", { name: /All \(2\)/ }).click();
  await page.getByTestId("list-sort-title").click();
  const order = await page.getByTestId(/^list-item-/).evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(order).toEqual([`list-item-${INCEPTION}`, `list-item-${INTERSTELLAR}`]);

  // Remove + undo.
  await page.getByTestId(`remove-${INTERSTELLAR}`).click();
  await expect(page.getByTestId(`list-item-${INTERSTELLAR}`)).toHaveCount(0);
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId(`list-item-${INTERSTELLAR}`)).toBeVisible();

  // Rename and change visibility.
  await page.goto("/lists");
  await page.getByTestId("list-card-Date night").click();
  await page.getByTestId("edit-list").click();
  await page.getByTestId("list-name-input").fill("Date nights");
  await page.getByTestId("visibility-friends").click();
  await page.getByTestId("list-editor-submit").click();
  await expect(page.getByTestId("list-title")).toHaveText("Date nights");
  await expect(page.getByTestId("list-visibility")).toContainText("Friends can see");

  // Everything persists across reloads and new sessions.
  await page.reload();
  await expect(page.getByTestId("list-title")).toHaveText("Date nights");
  await signOut(page);
  await signIn(page, user);
  await page.goto("/lists");
  await expect(page.getByTestId("list-card-Watchlist")).toContainText("2 movies");
  await expect(page.getByTestId("list-card-Date nights")).toContainText("1 movie");
  await expect(page.getByTestId("list-card-Classics")).toContainText("1 movie");
  await page.goto(`/movie/${INCEPTION}`);
  await expect(page.getByLabel("Rated 4 of 5")).toBeVisible();

  // Delete a list (with confirmation); movies in other lists remain.
  await page.goto("/lists");
  await page.getByTestId("list-card-Date nights").click();
  await page.getByTestId("delete-list").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("Delete “Date nights”?");
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page).toHaveURL(/\/lists$/);
  await expect(page.getByTestId("list-card-Date nights")).toHaveCount(0);
  await expect(page.getByTestId("list-card-Watchlist")).toContainText("2 movies");

  // Activity log reflects what happened.
  await page.goto("/profile");
  await expect(page.getByTestId("activity")).toContainText("Deleted the list Date nights");
  await expect(page.getByTestId("activity")).toContainText("Rated Inception");
  expect(errors).toEqual([]);
});
