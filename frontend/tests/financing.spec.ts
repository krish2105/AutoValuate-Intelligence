import { test, expect } from "@playwright/test";
import {
  computeFinancing, UAE_MAX_TENURE_MONTHS, UAE_MIN_DOWN_PAYMENT_PCT,
} from "../lib/financing";

/**
 * Pure unit tests for the UAE auto-loan maths — no page needed, so they run in the existing
 * Playwright CI rather than dragging in a second test framework (same pattern as deal-score).
 *
 * The point worth pinning hardest is the flat-vs-reducing distinction. UAE banks quote a FLAT
 * rate; using the textbook amortisation formula instead would under-state the monthly payment,
 * which is the one error direction that misleads a buyer about what they can afford.
 */

const base = { priceAed: 100_000, downPaymentPct: 20, tenureMonths: 60, flatRatePct: 3 };

test("flat-rate monthly matches the bank's arithmetic, not reducing-balance", () => {
  const p = computeFinancing(base);
  // 20% of 100k down -> 80k principal. Flat: 80k * 3% * 5y = 12,000 interest.
  expect(p.downPaymentAed).toBe(20_000);
  expect(p.principalAed).toBe(80_000);
  expect(p.totalInterestAed).toBe(12_000);
  expect(p.totalPayableAed).toBe(92_000);
  expect(p.monthlyAed).toBe(1533); // 92,000 / 60, rounded
});

test("effective APR is ~1.9x the flat rate — the whole reason we show it", () => {
  const p = computeFinancing(base);
  expect(p.effectiveAprPct).not.toBeNull();
  // Independently computed: 5.642%. If this drifts, the solver changed.
  expect(p.effectiveAprPct!).toBeGreaterThan(5.6);
  expect(p.effectiveAprPct!).toBeLessThan(5.7);
  // The user-facing claim: a 3% flat quote really costs nearly double that.
  expect(p.effectiveAprPct! / base.flatRatePct).toBeGreaterThan(1.8);
});

test("APR solver is exact on a known reducing-balance loan (control)", () => {
  // Build the payment for a TRUE 6%/yr reducing-balance loan, then solve it back.
  const P = 80_000, n = 60, i = 0.06 / 12;
  const monthly = (P * i) / (1 - Math.pow(1 + i, -n));
  // Express that same loan as an equivalent flat rate so computeFinancing reproduces it.
  const totalInterest = monthly * n - P;
  const flat = (totalInterest / P / (n / 12)) * 100;
  const p = computeFinancing({ priceAed: P, downPaymentPct: 0, tenureMonths: n, flatRatePct: flat });
  expect(p.effectiveAprPct!).toBeGreaterThan(5.99);
  expect(p.effectiveAprPct!).toBeLessThan(6.01);
});

test("zero interest degrades cleanly rather than dividing by zero", () => {
  const p = computeFinancing({ ...base, flatRatePct: 0 });
  expect(p.totalInterestAed).toBe(0);
  expect(p.monthlyAed).toBe(Math.round(80_000 / 60));
  expect(p.effectiveAprPct).toBe(0);
});

test("paying cash borrows nothing and reports no APR", () => {
  const p = computeFinancing({ ...base, downPaymentPct: 100 });
  expect(p.principalAed).toBe(0);
  expect(p.monthlyAed).toBe(0);
  expect(p.totalInterestAed).toBe(0);
  expect(p.effectiveAprPct).toBeNull();
});

test("a down payment under the UAE regulatory minimum is flagged", () => {
  expect(computeFinancing({ ...base, downPaymentPct: 10 }).belowRegulatoryMinimum).toBe(true);
  expect(computeFinancing({ ...base, downPaymentPct: UAE_MIN_DOWN_PAYMENT_PCT })
    .belowRegulatoryMinimum).toBe(false);
});

test("a longer term lowers the monthly but costs more overall — the trade-off the card exists to show", () => {
  const short = computeFinancing({ ...base, tenureMonths: 24 });
  const long = computeFinancing({ ...base, tenureMonths: UAE_MAX_TENURE_MONTHS });
  expect(long.monthlyAed).toBeLessThan(short.monthlyAed);
  expect(long.totalInterestAed).toBeGreaterThan(short.totalInterestAed);
});

test("monthly rises monotonically with the flat rate", () => {
  let prev = -1;
  for (const flatRatePct of [0, 1, 2, 3, 5, 8]) {
    const m = computeFinancing({ ...base, flatRatePct }).monthlyAed;
    expect(m).toBeGreaterThan(prev);
    prev = m;
  }
});

test("hostile inputs never produce NaN or negative money", () => {
  for (const bad of [
    { ...base, priceAed: 0 },
    { ...base, priceAed: -5000 },
    { ...base, tenureMonths: 0 },
    { ...base, downPaymentPct: 150 },
    { ...base, downPaymentPct: -20 },
    { ...base, flatRatePct: -3 },
  ]) {
    const p = computeFinancing(bad);
    for (const v of [p.monthlyAed, p.principalAed, p.totalInterestAed, p.totalPayableAed,
      p.downPaymentAed]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  }
});
