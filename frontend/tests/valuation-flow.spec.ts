import { test, expect } from "@playwright/test";

/**
 * Regression tests for two production bugs (2026-07-15, user-reported):
 *
 * 1. The results pane went BLANK after "Value my car" — AnimatePresence mode="wait"
 *    waited on an exit-complete callback that never fired, so the result pane never
 *    mounted even though the valuation finished. These tests run the demo-garage flow
 *    end-to-end and assert the result stack actually renders.
 *
 * 2. The ⌘K palette dead-ended (exact-substring search + Enter doing nothing) and got
 *    stuck open after running a command (same exit-stall class).
 *
 * The backend origin is blocked so the app deterministically uses its offline demo
 * fallback — the UI path under test (loading → result swap) is identical either way.
 */

test.beforeEach(async ({ page }) => {
  // Force the offline/demo path: abort every call to the live API origin.
  await page.route("**autovaluate-api.onrender.com/**", (route) => route.abort());
  // Skip the first-visit onboarding tour — its full-screen overlay (z-[71])
  // intercepts every click in a fresh Playwright profile.
  await page.addInitScript(() => localStorage.setItem("av_onboarded_v1", "1"));
});

test("demo-garage run renders the full result stack (no blank pane)", async ({ page }) => {
  await page.goto("/");

  // Kick off a full pipeline run from the demo garage.
  await page.getByRole("button", { name: /accident-repaired suv/i }).click();

  // The loading skeleton may appear, but the RESULT must replace it. The demo
  // fallback streams 7 trace steps (~0.5s each) before the result lands.
  await expect(page.getByRole("heading", { name: /fair-market valuation/i })).toBeVisible({ timeout: 30_000 });

  // The rest of the stack mounts with it — spot-check sections from top to bottom.
  await expect(page.getByRole("heading", { name: /visual damage assessment/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /negotiation coach/i })).toBeVisible();

  // And the skeleton is gone — the old bug left shimmering cards forever.
  await expect(page.locator(".animate-shimmer")).toHaveCount(0);
});

test("command palette: fuzzy query never dead-ends, action runs, palette closes", async ({ page }) => {
  await page.goto("/");

  // Open via the header affordance (same setOpen path as the Ctrl/⌘-K hotkey).
  await page.getByRole("button", { name: /open command palette/i }).click();
  const input = page.getByRole("textbox", { name: /search commands/i });
  await expect(input).toBeVisible();

  // "validate" is not a substring of any command — the old matcher returned nothing
  // and Enter did nothing. Now the all-commands fallback must show.
  await input.fill("validate");
  await expect(page.getByText(/no exact match/i)).toBeVisible();
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();

  // Run the theme toggle and assert the palette actually CLOSES (it used to wedge open).
  await page.getByRole("option").filter({ hasText: /switch to (dark|light) mode/i }).click();
  await expect(page.getByRole("dialog", { name: /command palette/i })).toHaveCount(0);

  // Esc also closes a re-opened palette.
  await page.getByRole("button", { name: /open command palette/i }).click();
  await expect(input).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /command palette/i })).toHaveCount(0);
});

test("disabled submit explains itself when make/model are missing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/enter the make and model to enable the valuation/i)).toBeVisible();
});
