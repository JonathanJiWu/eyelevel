import { test as base, expect, type Browser, type Locator, type Page } from "@playwright/test";

export { expect };

/**
 * Make page.goto / page.reload wait until React has hydrated the statically
 * rendered HTML (the app sets <html data-hydrated="true"> on mount), so tests
 * never interact with server-rendered markup that is about to be replaced.
 */
export function patchPage(page: Page): Page {
  const waitForApp = () => page.waitForSelector('html[data-hydrated="true"]', { state: "attached", timeout: 30_000 });
  // A full page load drops Firestore writes that are still in flight (the app
  // keeps no offline cache). Wait for pending writes first, like a person
  // would naturally do by not reloading mid-save.
  const settle = () =>
    page
      .evaluate(() =>
        Promise.race([
          (window as unknown as { __eyelevel?: { waitForPendingWrites(): Promise<void> } }).__eyelevel?.waitForPendingWrites(),
          new Promise((resolve) => setTimeout(resolve, 10_000)),
        ]),
      )
      .catch(() => undefined);
  const goto = page.goto.bind(page);
  const reload = page.reload.bind(page);
  page.goto = (async (...args: Parameters<Page["goto"]>) => {
    await settle();
    const response = await goto(...args);
    await waitForApp();
    return response;
  }) as Page["goto"];
  page.reload = (async (...args: Parameters<Page["reload"]>) => {
    await settle();
    const response = await reload(...args);
    await waitForApp();
    return response;
  }) as Page["reload"];
  return page;
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await use(patchPage(page));
  },
});

export async function newPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: patchPage(await context.newPage()) };
}

/**
 * Navigators keep previously visited screens mounted (hidden), so header
 * controls can exist several times in the DOM; target the visible one.
 */
export const visible = (locator: Locator) => locator.filter({ visible: true });

export const AUTH_EMULATOR = process.env.E2E_AUTH_EMULATOR ?? "http://127.0.0.1:9199";
export const TMDB = process.env.E2E_TMDB ?? "http://127.0.0.1:4010";
export const PROJECT = process.env.E2E_PROJECT ?? "demo-eyelevel";
export const PASSWORD = "movies2024";

let counter = 0;
export function uniqueUser(prefix: string) {
  counter += 1;
  const stamp = `${Date.now().toString(36)}${counter}${Math.floor(Math.random() * 1000)}`;
  const username = `${prefix}_${stamp}`.slice(0, 20);
  return { username, displayName: `${prefix[0].toUpperCase()}${prefix.slice(1)} ${stamp.slice(-4)}`, email: `${username}@example.com`, password: PASSWORD };
}
export type TestUser = ReturnType<typeof uniqueUser>;

/** Collect console errors / page errors so tests can assert a clean console. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Expected noise: failed image loads for intentionally missing posters, aborted fetches.
    if (/Failed to load resource|net::ERR_ABORTED|ERR_INTERNET_DISCONNECTED/.test(text)) return;
    errors.push(text);
  });
  return errors;
}

export async function register(page: Page, user: TestUser, { redirect }: { redirect?: string } = {}) {
  await page.goto(redirect ? `/register?redirect=${encodeURIComponent(redirect)}` : "/register");
  await page.getByTestId("register-name").fill(user.displayName);
  const username = page.getByTestId("register-username");
  await username.fill(user.username);
  await page.getByTestId("register-email").fill(user.email);
  await page.getByTestId("register-password").fill(user.password);
  await page.getByTestId("register-confirm").fill(user.password);
  await expect(page.getByText(`@${user.username} is available`)).toBeVisible();
  await page.getByTestId("register-submit").click();
  await expect(page).not.toHaveURL(/\/register/);
  // Account setup finished once the header shows the avatar.
  await expect(visible(page.getByTestId("header-profile"))).toBeVisible();
}

export async function signIn(page: Page, user: TestUser) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(user.email);
  await page.getByTestId("login-password").fill(user.password);
  await page.getByTestId("login-submit").click();
  await expect(visible(page.getByTestId("header-profile"))).toBeVisible();
}

export async function signOut(page: Page) {
  await page.goto("/profile");
  await page.getByTestId("sign-out").click();
  await expect(visible(page.getByTestId("header-sign-in"))).toBeVisible();
}

export async function newUserPage(browser: Browser, prefix: string) {
  const { context, page } = await newPage(browser);
  const user = uniqueUser(prefix);
  await register(page, user);
  return { context, page, user };
}

export function toast(page: Page) {
  return page.getByTestId("toast").last();
}

/** Add a movie (by TMDB id) to one or more lists from its detail page. */
export async function addToLists(page: Page, movieId: number, listNames: string[]) {
  await page.goto(`/movie/${movieId}`);
  await page.getByTestId("choose-lists").click();
  const picker = page.getByTestId("list-picker");
  await expect(picker).toBeVisible();
  for (const name of listNames) {
    const option = picker.getByTestId(`list-option-${name}`);
    if ((await option.getAttribute("aria-checked")) !== "true") await option.click();
  }
  await picker.getByTestId("list-picker-save").click();
  await expect(picker).toBeHidden();
}

/** Latest out-of-band (password reset / verification) codes from the Auth emulator. */
export async function oobCodes(email: string) {
  const res = await fetch(`${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const body = (await res.json()) as { oobCodes: { email: string; requestType: string; oobCode: string }[] };
  return body.oobCodes.filter((c) => c.email === email);
}
