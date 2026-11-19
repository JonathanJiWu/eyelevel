import { defineConfig, devices } from "@playwright/test";

/**
 * Run through `npm run test:e2e`, which starts the mock TMDB API, Firebase
 * emulators and the production server before invoking Playwright.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results/playwright",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3200",
    trace: "off",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 860 },
    actionTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } }],
});
