import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import valuation from "../lib/eval/valuation_metrics.json";

/**
 * /model report-card tests (WS E1/E8).
 *
 * The calibration plot is the one chart that can falsify our own honesty claim, so it gets a
 * real-browser test rather than a build-passes assumption: Recharts renders nothing until its
 * ResizeObserver fires, which a headless/offscreen pane can silently skip — the chart would be
 * absent in production and nothing else would complain.
 *
 * These assertions read from the same eval JSON the page renders, so retraining updates both
 * together and a stale hardcoded number can't drift into a passing test.
 */

test("model page shows the shipped pricing metrics from the eval JSON", async ({ page }) => {
  await page.goto("/model");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/model report card/i);
  // Median error, straight from valuation_metrics.json — not a copy of it.
  await expect(page.getByText(`${valuation.metrics.median_APE_pct.mean}%`).first()).toBeVisible();
});

test("calibration plot actually renders its curve in a real browser", async ({ page }) => {
  await page.goto("/model");
  const plot = page.getByRole("img", { name: /reliability diagram/i });
  await expect(plot).toBeVisible();

  // Recharts draws one <path class="recharts-curve"> per Line: the ideal diagonal + actual.
  const curves = plot.locator("path.recharts-curve");
  await expect(curves).toHaveCount(2, { timeout: 10_000 });

  // One dot per measured calibration level — proves the data bound, not just an empty axis frame.
  await expect(plot.locator(".recharts-line-dots circle"))
    .toHaveCount(valuation.calibration_curve.length);
});

test("the honesty numbers are the measured ones, not rounded-up marketing", async ({ page }) => {
  await page.goto("/model");
  // Coverage must be reported per segment; an 80% average can hide a badly-covered group.
  // Exact match: "luxury cars" also occurs in the surrounding prose.
  for (const tier of Object.keys(valuation.conformal.coverage_by_tier)) {
    await expect(page.getByText(`${tier} cars`, { exact: true })).toBeVisible();
  }
  // Monotonicity is a guarantee, so it must read 100% — if the model regresses, this fails.
  expect(valuation.monotonicity.kilometers.violation_rate).toBe(0);
  expect(valuation.monotonicity.age.violation_rate).toBe(0);
});

test("model page has no accessibility violations", async ({ page }) => {
  // Same discipline as the landing-page axe test: reduced motion + settle, so axe measures
  // final rendered contrast rather than a mid-fade Reveal frame (that flakes otherwise).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/model", { waitUntil: "networkidle" });
  await expect(page.getByRole("img", { name: /reliability diagram/i })).toBeVisible();
  await page.waitForTimeout(3000);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations,
    results.violations.map((v) => `${v.impact}: ${v.id} — ${v.help}`).join("\n"),
  ).toEqual([]);
});
