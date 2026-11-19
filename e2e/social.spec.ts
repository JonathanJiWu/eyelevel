import type { Page } from "@playwright/test";
import { addToLists, expect, newUserPage, test, toast, type TestUser } from "./helpers";

const INCEPTION = 27205;
const INTERSTELLAR = 157336;
const PARASITE = 496243;
const MATRIX = 603;

async function findPerson(page: Page, user: TestUser) {
  await page.goto("/friends");
  await page.getByTestId("people-search").fill(user.username);
  const row = page.getByTestId("people-results").getByTestId(`user-row-${user.username}`);
  await expect(row).toBeVisible();
  return row;
}

async function createList(page: Page, name: string, visibility: "friends" | "private") {
  await page.goto("/lists");
  await page.getByTestId("create-list").click();
  await page.getByTestId("list-name-input").fill(name);
  await page.getByTestId(`visibility-${visibility}`).click();
  await page.getByTestId("list-editor-submit").click();
  await expect(page.getByTestId("list-title")).toHaveText(name);
}

test("friends: requests, shared lists, privacy boundaries and watchlist comparison", async ({ browser }) => {
  test.setTimeout(240_000);
  const alice = await newUserPage(browser, "alice");
  const bob = await newUserPage(browser, "bob");
  const carol = await newUserPage(browser, "carol");

  // Alice: friends-visible Watchlist + a private list.
  await addToLists(alice.page, INCEPTION, ["Watchlist"]);
  await addToLists(alice.page, INTERSTELLAR, ["Watchlist"]);
  await createList(alice.page, "Secret", "private");
  await addToLists(alice.page, MATRIX, ["Secret"]);
  // Bob: overlapping interests.
  await addToLists(bob.page, INCEPTION, ["Watchlist"]);
  await addToLists(bob.page, PARASITE, ["Watchlist"]);

  // Before becoming friends, Bob can't see Alice's lists.
  const aliceRow = await findPerson(bob.page, alice.user);
  await aliceRow.getByRole("link").click();
  await expect(bob.page.getByTestId("not-friends-notice")).toBeVisible();

  // Alice finds Bob and sends a request; duplicates are impossible.
  const bobRow = await findPerson(alice.page, bob.user);
  await bobRow.getByRole("button", { name: "Add friend" }).click();
  await expect(toast(alice.page)).toContainText(`Friend request sent to ${bob.user.displayName}`);
  await expect(bobRow.getByRole("button", { name: "Cancel request" })).toBeVisible();
  await expect(bobRow.getByRole("button", { name: "Add friend" })).toHaveCount(0);

  // Bob sees the request (live) with a badge, and accepts it.
  await bob.page.goto("/friends");
  await expect(bob.page.getByLabel("1 pending friend requests")).toBeVisible();
  const request = bob.page.getByTestId("incoming-requests").getByTestId(`user-row-${alice.user.username}`);
  await request.getByRole("button", { name: "Accept" }).click();
  await expect(toast(bob.page)).toContainText(`You and ${alice.user.displayName} are now friends`);
  await expect(bob.page.getByTestId("friends-list")).toContainText(alice.user.displayName);
  // Alice's friends list updates in real time.
  await alice.page.goto("/friends");
  await expect(alice.page.getByTestId("friends-list")).toContainText(bob.user.displayName);
  await expect(alice.page.getByTestId("friends-list")).toContainText("1 movie in common");

  // Bob sees Alice's friends-visible list, never the private one.
  await bob.page.goto("/friends");
  await bob.page.getByTestId("friends-list").getByRole("link", { name: new RegExp(alice.user.displayName) }).click();
  await expect(bob.page.getByTestId("shared-list-Watchlist")).toBeVisible();
  await expect(bob.page.getByTestId("shared-list-Secret")).toHaveCount(0);
  await expect(bob.page.getByTestId("taste-match")).toContainText("33%");
  await bob.page.getByTestId("shared-list-Watchlist").click();
  await expect(bob.page.getByTestId("shared-list")).toContainText("Inception");
  await expect(bob.page.getByTestId("shared-list")).toContainText("Interstellar");
  await expect(bob.page.getByTestId("shared-list")).not.toContainText("The Matrix");

  // Movie page: "which friends have this".
  await bob.page.goto(`/movie/${INCEPTION}`);
  await expect(bob.page.getByTestId("friends-who-saved")).toContainText("1 friend has this");
  await expect(bob.page.getByTestId("friends-who-saved")).toContainText(alice.user.displayName);
  await bob.page.goto(`/movie/${MATRIX}`);
  await expect(bob.page.getByTestId("friends-who-saved")).toHaveCount(0);

  // Comparison.
  await bob.page.goto("/friends");
  await bob.page.getByTestId(`compare-${alice.user.username}`).click();
  await expect(bob.page.getByTestId("match-score")).toHaveText("33% match");
  const results = bob.page.getByTestId("compare-results");
  await expect(results).toContainText("Inception");
  await expect(results).not.toContainText("Parasite");
  await bob.page.getByRole("tab", { name: /Only you/ }).click();
  await expect(results).toContainText("Parasite");
  await bob.page.getByRole("tab", { name: new RegExp(`Only ${alice.user.displayName}`) }).click();
  await expect(results).toContainText("Interstellar");
  await expect(results).not.toContainText("The Matrix");

  // Ratings are shared only when allowed.
  await alice.page.goto(`/movie/${INTERSTELLAR}`);
  await alice.page.getByTestId("rate-5").click();
  await expect(alice.page.getByLabel("Rated 5 of 5")).toBeVisible();
  await bob.page.goto(`/movie/${INTERSTELLAR}`);
  await expect(bob.page.getByTestId("friends-who-saved")).toContainText("rated ★★★★★");
  await alice.page.goto("/profile");
  await alice.page.getByTestId("toggle-share-ratings").click();
  await expect(toast(alice.page)).toContainText("Privacy settings saved");
  await bob.page.reload();
  await expect(bob.page.getByTestId("friends-who-saved")).toContainText(alice.user.displayName);
  await expect(bob.page.getByTestId("friends-who-saved")).not.toContainText("rated");

  // Making a list private removes it from what friends can see.
  await alice.page.goto("/lists");
  await alice.page.getByTestId("list-card-Watchlist").click();
  await alice.page.getByTestId("edit-list").click();
  await alice.page.getByTestId("visibility-private").click();
  await alice.page.getByTestId("list-editor-submit").click();
  await expect(alice.page.getByTestId("list-visibility")).toContainText("Private");
  await bob.page.goto(`/movie/${INCEPTION}`);
  await expect(bob.page.getByTestId("movie-title")).toHaveText("Inception");
  await expect(bob.page.getByTestId("friends-who-saved")).toHaveCount(0);

  // Carol: not discoverable -> not found by search.
  await carol.page.goto("/profile");
  await carol.page.getByTestId("toggle-discoverable").click();
  await expect(toast(carol.page)).toContainText("Privacy settings saved");
  await alice.page.goto("/friends");
  await alice.page.getByTestId("people-search").fill(carol.user.username);
  await expect(alice.page.getByTestId("people-no-results")).toBeVisible();
  // Discoverable again, but not accepting requests.
  await carol.page.getByTestId("toggle-discoverable").click();
  await carol.page.getByTestId("toggle-requests").click();
  await expect(toast(carol.page)).toContainText("Privacy settings saved");
  const carolRow = await findPerson(alice.page, carol.user);
  await carolRow.getByRole("button", { name: "Add friend" }).click();
  await expect(toast(alice.page)).toContainText("isn't accepting friend requests");

  // Declining a request.
  await carol.page.getByTestId("toggle-requests").click();
  const bobForCarol = await findPerson(carol.page, bob.user);
  await bobForCarol.getByRole("button", { name: "Add friend" }).click();
  await expect(bobForCarol.getByRole("button", { name: "Cancel request" })).toBeVisible();
  await bob.page.goto("/friends");
  await bob.page.getByTestId("incoming-requests").getByRole("button", { name: "Decline" }).click();
  await expect(toast(bob.page)).toContainText("Request declined");
  await expect(bobForCarol.getByRole("button", { name: "Add friend" })).toBeVisible();

  // Removing a friend revokes access.
  const bobRow2 = await findPerson(alice.page, bob.user);
  await bobRow2.getByRole("button", { name: "Friends" }).click();
  await alice.page.getByTestId("confirm-dialog-confirm").click();
  await expect(toast(alice.page)).toContainText(`Removed ${bob.user.displayName} from your friends`);
  await bob.page.goto("/friends");
  await expect(bob.page.getByTestId("friends-list")).not.toContainText(alice.user.displayName);

  await Promise.all([alice.context.close(), bob.context.close(), carol.context.close()]);
});
