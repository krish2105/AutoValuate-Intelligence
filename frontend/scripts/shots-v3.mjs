/**
 * Fresh light-mode screenshots for the v3 presentation (docs/presentation/shots-v3/).
 *
 * Runs against a LOCAL PRODUCTION build of the same commit that is live on Vercel, so every
 * shot shows deployed behaviour. Light mode via next-themes localStorage. The demo sample
 * ("Accident-repaired SUV") exercises the full pipeline including damage findings; the asking
 * price is typed in BEFORE submitting so the deal-score card renders.
 *
 * Usage:  npm run start &   (production server on :3000)
 *         node scripts/shots-v3.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../docs/presentation/shots-v3");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 950 },
  deviceScaleFactor: 2,
  colorScheme: "light",
});
const page = await ctx.newPage();

// Light theme + skip the first-visit tour before any app code runs.
await page.addInitScript(() => {
  localStorage.setItem("theme", "light");
  localStorage.setItem("av_onboarded_v1", "1");
});

const BASE = process.env.SHOT_BASE || "https://auto-valuate-intelligence.vercel.app";
await page.goto(BASE + "/", { waitUntil: "networkidle" });

// If the tour still appeared (unknown storage key), dismiss it via its Skip button.
const skip = page.getByRole("button", { name: /skip/i }).first();
if (await skip.isVisible().catch(() => false)) await skip.click();

const card = (title) =>
  page.locator("section", { has: page.locator("h2", { hasText: title }) }).first();

async function shootCard(title, file) {
  try {
    const el = card(title);
    await el.scrollIntoViewIfNeeded({ timeout: 15000 });
    await page.waitForTimeout(900); // let reveal animations finish
    await el.screenshot({ path: join(OUT, file) });
    console.log("shot:", file);
  } catch {
    console.log("MISSED:", file, "(card not found:", title + ")");
  }
}

// ---- 01: landing hero ----
await page.waitForTimeout(1500);
await page.screenshot({ path: join(OUT, "01_hero.png") });
console.log("shot: 01_hero.png");

// ---- run the damaged-SUV sample WITH an asking price (so deal score renders) ----
// RUN A — the damaged-SUV sample. Clicking the card may auto-run the pipeline; either way
// the form ends up filled with the sample vehicle. This run supplies the damage-rich cards.
await page.getByText("Accident-repaired SUV", { exact: false }).first().click();
await page.waitForTimeout(800);
const submitBtn = page.getByRole("button", { name: /value my car/i });
if (await submitBtn.isVisible().catch(() => false)) await submitBtn.click();
await page.locator("h2", { hasText: "Seller report" }).waitFor({ timeout: 120_000 });
await page.waitForTimeout(1500);



// ---- 02: form + reasoning trace ----
const trace = page.locator("section", { has: page.locator("h2", { hasText: "Live reasoning trace" }) }).first();
if (await trace.isVisible().catch(() => false)) {
  await trace.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await trace.screenshot({ path: join(OUT, "02_trace.png") });
  console.log("shot: 02_trace.png");
}

await shootCard("Fair-market valuation", "03_valuation_shap.png");
await shootCard("Visual damage assessment", "04_damage.png");
await shootCard("Repair estimate", "08_repair.png");
await shootCard("Market analytics", "09_market.png");
await shootCard("Depreciation curve", "10_depreciation.png");
await shootCard("Sell-timing forecast", "10b_forecast.png");
await shootCard("Seller report", "11_report.png");
await shootCard("Negotiation coach", "12_negotiation.png");
await shootCard("Listing pack", "13_listing.png");

// RUN B — same vehicle resubmitted WITH an asking price, because `asking` is snapshotted at
// submit time and the deal-score card only renders when it was present at submission.
await page.getByPlaceholder(/48,000/).scrollIntoViewIfNeeded();
await page.getByPlaceholder(/48,000/).fill("105000");
await page.waitForTimeout(300);
await page.getByRole("button", { name: /value my car/i }).click();
await page.locator("h2", { hasText: "Deal score" }).waitFor({ timeout: 120_000 })
  .catch(() => console.log("deal score still absent after run B"));
await page.waitForTimeout(1200);
await shootCard("Deal score", "05_deal_score.png");
await shootCard("What-if explorer", "06_whatif.png");
await shootCard("Monthly payment", "07_financing.png");

// ---- capture coaching: switch to guided walk-around and inject a "too far" photo ----
try {
  await page.getByRole("tab", { name: /guided walk-around/i }).click()
    .catch(() => page.getByText("Guided walk-around").first().click());
  await page.waitForTimeout(400);
  const dial = page.getByRole("button", { name: /front/i }).first();
  await dial.scrollIntoViewIfNeeded();
  const input = page.locator('input[type="file"][capture]');
  await input.setInputFiles(process.env.FAR_IMG);
  // wait for the coach verdict (model download + inference)
  await page.getByText(/step closer|cut off|blurry|too dark/i).first()
    .waitFor({ timeout: 60_000 });
  await page.waitForTimeout(400);
  const gc = page.locator("div.rounded-2xl.border", {
    has: page.getByText(/angles captured|Walk around/i) }).first();
  await gc.screenshot({ path: join(OUT, "14_coaching.png") });
  console.log("shot: 14_coaching.png");
} catch (e) {
  console.log("coaching shot failed:", e.message?.slice(0, 120));
}

// ---- /model report card ----
await page.goto(BASE + "/model", { waitUntil: "networkidle" });
await page.waitForTimeout(1800);
await page.screenshot({ path: join(OUT, "15_model_card.png") });
console.log("shot: 15_model_card.png");

// ---- /dealer bulk ----
await page.goto(BASE + "/dealer", { waitUntil: "networkidle" });
await page.getByText("Load a sample fleet").click();
await page.waitForTimeout(400);
await page.getByText(/Value all/).click();
await page.getByText(/Fleet value/).waitFor({ timeout: 60_000 }).catch(() => {});
await page.waitForTimeout(800);
await page.screenshot({ path: join(OUT, "16_dealer.png") });
console.log("shot: 16_dealer.png");

await browser.close();
console.log("done →", OUT);
