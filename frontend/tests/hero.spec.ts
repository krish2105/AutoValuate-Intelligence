import { test, expect, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Landing-page smoke + hero appraisal-loop tests (master plan WS F2).
 *
 * The hero runs an ambient loop after its draw-in: a scanner sweeps the car,
 * damage findings pop with confidence chips, then a price reads out. These tests
 * assert the loop actually plays in a real browser — and that the reduced-motion
 * path renders the findings statically with no scanner at all.
 */

const opacityOf = (locator: Locator) =>
  locator.evaluate((el) => parseFloat(getComputedStyle(el).opacity));

test("landing hero renders headline, CTA, and the appraisal stage", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/know what your car/i);
  await expect(page.getByRole("button", { name: /begin appraisal/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /grand-touring car/i })).toBeVisible();
});

test("hero appraisal loop plays: scanner sweeps, findings pop, price reads out", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("hero-scanner")).toBeAttached();

  // Findings mount invisible, then appear as the scanner passes (draw-in ~3s + sweep).
  const finding = page.getByTestId("hero-finding").first();
  expect(await opacityOf(finding)).toBeLessThan(0.1);
  await expect.poll(() => opacityOf(finding), { timeout: 15_000 }).toBeGreaterThan(0.5);
  await expect.poll(() => opacityOf(page.getByTestId("hero-price")), { timeout: 15_000 }).toBeGreaterThan(0.5);
});

test("reduced motion: findings rest visible, no scanner, no loop", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("hero-scanner")).toHaveCount(0);
  await expect(page.getByTestId("hero-finding")).toHaveCount(3);
  expect(await opacityOf(page.getByTestId("hero-finding").first())).toBeGreaterThan(0.9);
  expect(await opacityOf(page.getByTestId("hero-price"))).toBeGreaterThan(0.9);
});

test("landing page has no accessibility violations", async ({ page }) => {
  // The landing page pings the live backend on load (wakeBackend's /health fetch carries a
  // 120s timeout); against a cold Render dyno "networkidle" is unreachable and this test
  // times out — CI must not depend on a third-party dyno's sleep state. Mock the pings,
  // like every other spec does, so idle is reached deterministically.
  await page.route("**/health", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"status":"healthy"}' }));
  await page.route("https://autovaluate-api.onrender.com/", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"status":"ok"}' }));
  // reduced motion stops the HeroCar loop; the wait lets the hero's entrance fades
  // (kicker/headline/ticker — not reduced-motion gated) reach full opacity, so axe
  // measures final rendered contrast rather than a mid-fade frame.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations,
    results.violations.map((v) => `${v.impact}: ${v.id} — ${v.help}`).join("\n"),
  ).toEqual([]);
});
