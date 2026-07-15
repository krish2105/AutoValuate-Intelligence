import { test, expect } from "@playwright/test";

/**
 * Dealer bulk valuation (WS E2): the page must value a fleet through ONE
 * /estimate/batch request, and fall back to per-row /estimate calls when the
 * batch endpoint is unavailable (older deployed backend).
 */

const VALUATION = (mid: number) => ({
  ok: true,
  valuation: { price_low_aed: mid * 0.8, price_mid_aed: mid, price_high_aed: mid * 1.2 },
});

test("fleet is valued via a single batch request", async ({ page }) => {
  let batchCalls = 0;
  await page.route("**/estimate/batch", async (route) => {
    batchCalls += 1;
    const { vehicles } = route.request().postDataJSON() as { vehicles: unknown[] };
    await route.fulfill({
      json: {
        ok: true,
        count: vehicles.length,
        results: vehicles.map((_, i) => VALUATION(50_000 + i * 10_000)),
      },
    });
  });

  await page.goto("/dealer");
  await page.getByRole("button", { name: /load a sample fleet/i }).click();
  await page.getByRole("button", { name: /^value all/i }).click();

  await expect(page.getByText(/50,000/).first()).toBeVisible();
  expect(batchCalls).toBe(1);
});

test("falls back to per-row estimates when batch is unavailable", async ({ page }) => {
  let singleCalls = 0;
  await page.route("**/estimate/batch", (route) => route.fulfill({ status: 404, json: {} }));
  await page.route(/\/estimate$/, async (route) => {
    singleCalls += 1;
    await route.fulfill({ json: VALUATION(42_000) });
  });

  await page.goto("/dealer");
  await page.getByRole("button", { name: /load a sample fleet/i }).click();
  await page.getByRole("button", { name: /^value all/i }).click();

  await expect(page.getByText(/42,000/).first()).toBeVisible({ timeout: 20_000 });
  expect(singleCalls).toBeGreaterThan(0);
});
