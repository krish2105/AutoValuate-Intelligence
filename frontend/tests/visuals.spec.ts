import { test, expect, type Page } from "@playwright/test";
import shap from "../lib/eval/shap_report.json";
import { VALUATION } from "./_fixture";

/**
 * E4/E5/E6/E7 real-browser tests.
 *
 * Everything here is route-mocked, so it exercises the UI against a fixed payload rather
 * than a live Render dyno (which sleeps, and whose numbers move when the model is retrained).
 */

/** E3 fixture: 3 listings per age 1..8, prices falling with age, median per age. */
function depPayload(scope: "model" | "make") {
  const points: { age: number; price: number; km: number; year: number }[] = [];
  for (let age = 1; age <= 8; age++)
    for (let i = 0; i < 3; i++)
      points.push({ age, price: 90_000 - age * 8_000 + i * 1_500, km: 20_000 * age, year: 2026 - age });
  const median = Array.from({ length: 8 }, (_, k) => ({ age: k + 1, price: 90_000 - (k + 1) * 8_000 + 1_500, n: 3 }));
  return { ok: true, scope, make: "toyota", model: "corolla", n: points.length, reference_year: 2026, points, median };
}

async function mockAndValue(
  page: Page,
  asking?: number,
  dep: object | null = depPayload("model"),
  payload: object = VALUATION,
) {
  // E3 depreciation curve: fulfilled (or deliberately failed) so no test hits the live dyno.
  await page.route("**/market/depreciation*", async (route) => {
    if (dep) await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dep) });
    else await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });
  await page.route("**/valuate/stream", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: `event: result\ndata: ${JSON.stringify(payload)}\n\n`,
    });
  });
  // Sensitivity curve: a monotonically decreasing price per mileage step.
  await page.route("**/estimate/batch", async (route) => {
    const body = route.request().postDataJSON() as { vehicles: { kilometers: number }[] };
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        results: body.vehicles.map((v) => ({
          ok: true,
          valuation: { ...VALUATION.valuation, price_mid_aed: Math.round(70000 - v.kilometers * 0.12) },
        })),
      }),
    });
  });
  await page.route("**/health", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"status":"healthy"}' }));

  // The first-visit tour (components/onboarding.tsx) opens after 900ms and covers the form.
  // Pretend we've been here before, as any returning user has.
  await page.addInitScript(() => localStorage.setItem("av_onboarded_v1", "1"));

  await page.goto("/");
  // By accessible name, not placeholder: the free-text "describe your car" field's
  // placeholder also contains "Toyota".
  await page.getByRole("textbox", { name: "Make", exact: true }).fill("Toyota");
  await page.getByRole("textbox", { name: "Model", exact: true }).fill("Corolla");
  if (asking !== undefined) {
    await page.getByRole("spinbutton", { name: /asking price/i }).fill(String(asking));
  }
  await page.getByRole("button", { name: /value my car/i }).click();
  await expect(page.getByText(/comparable listings/i).first()).toBeVisible({ timeout: 20_000 });
}

// Derived from the fixture, not hardcoded: retraining moves the mid, and a test pinned to a
// stale number fails for the wrong reason (this one did, on an old mid).
const MID = VALUATION.valuation.price_mid_aed;

test("E4: asking price below fair value scores as a good deal", async ({ page }) => {
  const asking = Math.round(MID * 0.75);
  await mockAndValue(page, asking);
  await expect(page.getByText(/deal score/i).first()).toBeVisible();
  await expect(page.getByText(/below fair value/i).first()).toBeVisible();
  await expect(page.getByText(new RegExp(`${(MID - asking).toLocaleString()} below`))).toBeVisible();
});

test("E4: an overpriced ask is called out, not flattered", async ({ page }) => {
  await mockAndValue(page, Math.round(MID * 1.4));
  await expect(page.getByText(/above fair value/i).first()).toBeVisible();
});

test("E4: the asking price never leaves the browser", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => {
    const d = r.postData();
    if (d && /valuate|estimate/.test(r.url())) sent.push(d);
  });
  await mockAndValue(page, Math.round(MID * 0.75));
  await expect(page.getByText(/deal score/i)).toHaveCount(1);
  // The form's help text promises this; without the assertion it is only a promise. A
  // leak here would also anchor the model to the seller's price and persist a private
  // number into shared reports.
  expect(sent.length).toBeGreaterThan(0);
  for (const body of sent) expect(body).not.toContain("asking_price_aed");
});

test("E4: card is absent when no asking price is given", async ({ page }) => {
  await mockAndValue(page);
  await expect(page.getByText(/deal score/i)).toHaveCount(0);
});

test("E5: an implausibly cheap comparable is flagged for verification", async ({ page }) => {
  await mockAndValue(page);
  await expect(page.getByText(/too good to be true/i)).toBeVisible();
  await expect(page.getByText(/verifying the odometer/i)).toBeVisible();
  await expect(page.getByText(/1 to verify/i)).toBeVisible();
  // The ordinary comparable must NOT be flagged.
  await expect(page.getByText(/too good to be true/i)).toHaveCount(1);
});

test("E6: sensitivity curve renders and never slopes upward", async ({ page }) => {
  await mockAndValue(page);
  const curve = page.locator(".recharts-line-curve").first();
  await expect(curve).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/more mileage can never mean more money/i)).toBeVisible();
  await expect(page.getByText(/monotonicity guarantee is broken/i)).toHaveCount(0);
});

test("E3: depreciation curve plots the corpus with the honest asking-price caption", async ({ page }) => {
  await mockAndValue(page);
  await expect(page.getByText(/depreciation curve/i).first()).toBeVisible();
  await expect(page.getByText(/24 live listings/)).toBeVisible();
  // the sr-only summary proves the fetched data (count, scope, user car) reached the chart
  await expect(page.getByText(/scatter chart of 24 live toyota corolla listings/i)).toBeAttached();
  await expect(page.getByText(/asking prices of live UAE listings, not sale prices/i)).toBeVisible();
});

test("E3: a thin model widens to the make and says so instead of pretending", async ({ page }) => {
  await mockAndValue(page, undefined, depPayload("make"));
  await expect(page.getByText(/toyota \(all models\)/i).first()).toBeVisible();
  await expect(page.getByText(/too few corolla listings for a model-level curve/i)).toBeVisible();
});

test("E3: when the backend thins the points, the caption says 'sampled' not 'every listing'", async ({ page }) => {
  // n (900) far exceeds the plotted points (24): the dots are a sample, and the copy must say so.
  const dep = { ...depPayload("model"), n: 900 };
  await mockAndValue(page, undefined, dep);
  await expect(page.getByText(/900 live listings/)).toBeVisible();               // pill = full pool
  await expect(page.getByText(/each dot is one of 24 sampled listings/i)).toBeVisible();
  await expect(page.getByText(/median over all 900/i)).toBeVisible();
  await expect(page.getByText(/24 listings sampled from 900/i)).toBeAttached();  // sr-only
});

test("E3: card is simply absent when the endpoint is unavailable", async ({ page }) => {
  await mockAndValue(page, undefined, null);
  await expect(page.getByText(/comparable listings/i).first()).toBeVisible();
  await expect(page.getByText(/depreciation curve/i)).toHaveCount(0);
});

test("E2: damage map plots findings at their capture angles, camera-position honest", async ({ page }) => {
  const withAngles = {
    ...VALUATION,
    condition: {
      ...VALUATION.condition,
      cv_available: true,
      findings: [
        { damage_type: "dent", instances: 2, max_confidence: 0.8, photos_with_damage: [0, 1],
          value_impact_pct: 4, severity: "moderate", angles_with_damage: ["rear-left", "left"] },
        { damage_type: "scratch", instances: 1, max_confidence: 0.6, photos_with_damage: [0],
          value_impact_pct: 1.5, severity: "minor", angles_with_damage: ["rear-left"] },
      ],
    },
  };
  await mockAndValue(page, undefined, depPayload("model"), withAngles);
  await expect(page.getByText(/damage map/i).first()).toBeVisible();
  await expect(page.getByText(/rear left worst/i)).toBeVisible();
  await expect(page.getByText(/where damage was/i)).toBeVisible(); // the honesty caption
  await expect(page.getByText(/not a claim about the exact panel/i)).toBeVisible();
});

test("honesty: condition score band + verify badge render with the explainer", async ({ page }) => {
  const banded = {
    ...VALUATION,
    condition: {
      ...VALUATION.condition,
      cv_available: true,
      condition_score: 80,
      score_band: [74, 88],
      findings: [
        { damage_type: "dent", instances: 1, max_confidence: 0.78, photos_with_damage: [0],
          value_impact_pct: 4, severity: "moderate", uncertain: false },
        { damage_type: "scratch", instances: 1, max_confidence: 0.41, photos_with_damage: [0],
          value_impact_pct: 1.5, severity: "minor", uncertain: true },
      ],
    },
  };
  await mockAndValue(page, undefined, depPayload("model"), banded);
  await expect(page.getByText("74–88").first()).toBeVisible();
  await expect(page.getByText(/41% · verify/)).toBeVisible();
  await expect(page.getByText(/detector's measured error/i)).toBeVisible();
  await expect(page.getByText(/check them in person/i)).toBeVisible();
  // the confident finding keeps its plain confidence pill
  await expect(page.getByText(/78% · verify/)).toHaveCount(0);
});

test("E2: damage map is absent when findings carry no capture angles", async ({ page }) => {
  await mockAndValue(page); // default fixture: quick-upload style findings, no angle data
  await expect(page.getByText(/comparable listings/i).first()).toBeVisible();
  await expect(page.getByText(/damage map/i)).toHaveCount(0);
});

test("E7: beeswarm renders one dot per sampled car for every ranked feature", async ({ page }) => {
  await page.goto("/model");
  const swarm = page.getByRole("img", { name: /shap beeswarm/i });
  await expect(swarm).toBeVisible();
  // Pure SVG (no ResizeObserver), so this is exact rather than best-effort.
  await expect(swarm.locator("circle")).toHaveCount(shap.beeswarm.n * shap.beeswarm.order.length);
});
