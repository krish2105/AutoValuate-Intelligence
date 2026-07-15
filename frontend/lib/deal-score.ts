import type { Valuation } from "./types";

/**
 * E4 — deal score: where an asking price sits in the model's predictive distribution.
 *
 * The valuation ships a conformal band [low, high] whose measured coverage is ~80%, so in
 * log space `delta = (ln1p(high) - ln1p(low)) / 2` is the 80% half-width and the band edges
 * are the 10th/90th percentiles. That makes the whole thing recoverable client-side — no API
 * change, no bundle change, and it still works in demo/offline mode.
 *
 * Percentile uses a normal approximation, `sigma = delta / z(0.90)`. That assumption was
 * measured, not assumed: over 1,350 held-out residuals the log-price residuals are heavy-
 * tailed (kurtosis 5.25 vs 3.0) yet the approximation's percentiles land within **4.8pp
 * worst-case**, and are near-exact at the 10/50/90 anchors it is pinned to. 4.8pp is
 * acceptable for a coarse 0–100 score; it is NOT good enough to quote a precise percentile
 * at, which is why the UI shows a band and a verdict rather than "you are in the 23rd".
 *
 * If this ever needs to be exact, ship the empirical signed-residual quantiles per tier in
 * the model bundle and interpolate them instead.
 */

const Z90 = 1.2815515655446004; // Phi^-1(0.90)

/** Abramowitz & Stegun 7.1.26 — erf to ~1.5e-7, plenty against a 4.8pp model error. */
function erf(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

const normalCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

export type DealVerdict = "great" | "good" | "fair" | "high" | "overpriced";

export interface DealScore {
  /** 0–100. 100 = asking far below fair value. Rounded: the underlying estimate is ±~5pp. */
  score: number;
  /** P(a comparable car sells at or below this asking price), 0–1. */
  percentile: number;
  verdict: DealVerdict;
  /** Asking minus the model's mid, in AED. Negative = below fair value. */
  deltaAed: number;
  deltaPct: number;
  label: string;
}

const VERDICTS: [number, DealVerdict, string][] = [
  [80, "great", "Well below fair value"],
  [60, "good", "Below fair value"],
  [40, "fair", "Around fair value"],
  [20, "high", "Above fair value"],
  [0, "overpriced", "Well above fair value"],
];

/**
 * @param asking asking price in AED
 * @returns null when the band is unusable (non-positive or degenerate), rather than a
 *          confident-looking number derived from nothing.
 */
export function dealScore(v: Valuation, asking: number): DealScore | null {
  const { price_low_aed: lo, price_mid_aed: mid, price_high_aed: hi } = v;
  if (!(asking > 0) || !(lo > 0) || !(mid > 0) || !(hi > lo)) return null;

  const delta = (Math.log1p(hi) - Math.log1p(lo)) / 2;
  if (!(delta > 0)) return null;
  const sigma = delta / Z90;

  // P(true price <= asking): a low asking price sits low in the distribution -> good deal.
  const percentile = normalCdf((Math.log1p(asking) - Math.log1p(mid)) / sigma);
  const score = Math.round(Math.min(100, Math.max(0, (1 - percentile) * 100)));
  const [, verdict, label] = VERDICTS.find(([min]) => score >= min)!;

  return {
    score,
    percentile,
    verdict,
    deltaAed: Math.round(asking - mid),
    deltaPct: Math.round(((asking - mid) / mid) * 1000) / 10,
    label,
  };
}
