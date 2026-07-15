import { test, expect } from "@playwright/test";
import { dealScore } from "../lib/deal-score";
import type { Valuation } from "../lib/types";

/**
 * Pure unit tests for the deal score (E4) — no page needed, so they run in the existing
 * Playwright CI rather than dragging in a second test framework.
 *
 * The band edges are the 10th/90th percentiles by construction, so those anchors are exact
 * and worth pinning: they are what stops the score silently inverting or drifting.
 */

const v = (lo: number, mid: number, hi: number): Valuation => ({
  price_low_aed: lo, price_mid_aed: mid, price_high_aed: hi,
  interval_coverage: 0.8, interval_pct_width: ((hi - lo) / mid) * 100, currency: "AED",
  explanation: { baseline_log: 0, top_factors: [] },
  model_meta: {
    model_version: "test", cv_median_ape_pct: 15.87, cv_mae_aed: 33793,
    training_rows: 671, dataset: "test",
  },
});

// The shipped mass-tier band: delta 0.3735 in log space around a 45,330 mid.
const band = v(31203, 45330, 65855);

test("asking at the mid is a coin flip: 50th percentile, score 50", () => {
  const d = dealScore(band, 45330)!;
  expect(d.score).toBeGreaterThanOrEqual(49);
  expect(d.score).toBeLessThanOrEqual(51);
  expect(d.deltaAed).toBe(0);
  expect(d.verdict).toBe("fair");
});

test("band edges are the 10th/90th percentiles — the anchors the approximation is pinned to", () => {
  // asking == low  -> only ~10% of comparable cars sell below it -> a great deal (score ~90)
  expect(dealScore(band, 31203)!.score).toBeGreaterThanOrEqual(88);
  // asking == high -> ~90% sell below it -> overpriced (score ~10)
  expect(dealScore(band, 65855)!.score).toBeLessThanOrEqual(12);
});

test("score falls monotonically as the asking price rises", () => {
  const scores = [20_000, 31_203, 40_000, 45_330, 55_000, 65_855, 90_000]
    .map((a) => dealScore(band, a)!.score);
  for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
  expect(scores[0]).toBeGreaterThan(scores[scores.length - 1]);
});

test("score and percentile stay in range even for absurd asking prices", () => {
  for (const a of [1, 500, 5_000_000, 999_999_999]) {
    const d = dealScore(band, a)!;
    expect(d.score).toBeGreaterThanOrEqual(0);
    expect(d.score).toBeLessThanOrEqual(100);
    expect(d.percentile).toBeGreaterThanOrEqual(0);
    expect(d.percentile).toBeLessThanOrEqual(1);
  }
});

test("delta reports the gap against fair value, signed", () => {
  const cheap = dealScore(band, 35_000)!;
  expect(cheap.deltaAed).toBe(35_000 - 45_330);
  expect(cheap.deltaPct).toBeCloseTo(-22.8, 0);
  expect(dealScore(band, 55_000)!.deltaAed).toBeGreaterThan(0);
});

test("returns null rather than a confident-looking number when the band is unusable", () => {
  expect(dealScore(band, 0)).toBeNull();
  expect(dealScore(band, -5)).toBeNull();
  expect(dealScore(v(0, 0, 0), 45_000)).toBeNull();
  expect(dealScore(v(50_000, 45_330, 50_000), 45_000)).toBeNull(); // degenerate: hi == lo
});

test("a wider band (luxury) is less opinionated about the same relative gap", () => {
  // Same mid, wider interval -> the same asking price should score closer to neutral.
  const narrow = dealScore(v(40_000, 45_330, 51_000), 38_000)!.score;
  const wide = dealScore(v(25_000, 45_330, 80_000), 38_000)!.score;
  expect(wide).toBeLessThan(narrow);
});
