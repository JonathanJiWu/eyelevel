import { expect, patchPage, test } from "./helpers";

const VIEWPORTS = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

for (const vp of VIEWPORTS) {
  test(`layout fits a ${vp.name} screen (${vp.width}x${vp.height})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = patchPage(await context.newPage());
    for (const path of ["/", "/movie/27205", "/login", "/register", "/lists"]) {
      await page.goto(path);
      await page.waitForLoadState("load");
      await page.waitForTimeout(800);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/responsive-${vp.name}${path.replace(/\//g, "_") || "_home"}.png` });
    }
    // Navigation is reachable and labels are fully visible.
    await page.goto("/");
    const tab = page.getByTestId("tab-friends");
    await expect(tab).toBeVisible();
    const box = await tab.boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
    // Columns adapt to the width.
    const cards = page.getByTestId("movie-grid").getByTestId(/^movie-card-/);
    await expect(cards.first()).toBeVisible();
    const tops = await cards.evaluateAll((els) => els.slice(0, 12).map((e) => Math.round(e.getBoundingClientRect().top)));
    const perRow = tops.filter((t) => t === tops[0]).length;
    if (vp.name === "phone") expect(perRow).toBe(2);
    if (vp.name === "desktop") expect(perRow).toBeGreaterThanOrEqual(6);
    await context.close();
  });
}
