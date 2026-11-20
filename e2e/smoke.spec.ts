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

test("pages are served with a Content-Security-Policy that the app never violates", async ({ page, request }) => {
  const violations: string[] = [];
  await page.exposeFunction("__reportCspViolation", (v: string) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __reportCspViolation: (v: string) => void }).__reportCspViolation(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });

  const response = await page.goto("/");
  const policy = response?.headers()["content-security-policy"] ?? "";
  expect(policy).toContain("default-src 'self'");
  expect(policy).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("frame-ancestors 'self'");

  // Exercise the app: images, API calls, Firebase (emulators), routing, a lazily loaded route.
  await expect(page.getByTestId("movie-grid").getByTestId(/^movie-card-/).first()).toBeVisible();
  await page.goto("/movie/27205");
  await expect(page.getByTestId("movie-title")).toHaveText("Inception");
  await page.goto("/login");
  await expect(page.getByTestId("login-submit")).toBeVisible();
  expect(violations).toEqual([]);

  // Unknown pages and API responses carry policies too.
  const missing = await request.get("/definitely-not-a-page");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-security-policy"]).toContain("default-src 'self'");
  const api = await request.get("/api/health");
  expect(api.headers()["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'");
});
