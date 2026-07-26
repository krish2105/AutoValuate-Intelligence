/**
 * Auto-loan maths for the UAE market.
 *
 * WHY THIS IS NOT THE TEXTBOOK AMORTISATION FORMULA
 * -------------------------------------------------
 * UAE banks quote auto loans at a **flat rate**: interest is charged on the ORIGINAL
 * principal for the whole term, not on the reducing balance. A 3% "rate" on a 5-year loan
 * therefore costs ~3% x 5 = 15% of the principal in interest, and the true cost of money is
 * close to double the advertised number.
 *
 * If we used the standard reducing-balance formula here, our monthly figure would be
 * meaningfully LOWER than the quote the user is handed at the bank — the calculator would be
 * wrong in the one direction that misleads a buyer into thinking they can afford more.
 * So: compute the monthly payment the way the bank does (flat), and separately report the
 * **effective APR** so the user can see what the flat rate actually costs them.
 *
 * Everything here is pure and deterministic — no network, no dependency on the valuation
 * pipeline. It is an estimate for planning, NOT a financing offer or a quote.
 */

/** UAE Central Bank caps auto finance at 80% of vehicle value -> 20% minimum down payment. */
export const UAE_MIN_DOWN_PAYMENT_PCT = 20;
/** 60 months is the conventional ceiling for UAE auto loans. */
export const UAE_MAX_TENURE_MONTHS = 60;

export interface FinancingInput {
  priceAed: number;
  /** 0-100 */
  downPaymentPct: number;
  tenureMonths: number;
  /** Annual FLAT rate, percent — the number a UAE bank advertises. */
  flatRatePct: number;
}

export interface FinancingPlan {
  downPaymentAed: number;
  principalAed: number;
  monthlyAed: number;
  totalInterestAed: number;
  totalPayableAed: number;
  /**
   * Reducing-balance annual rate equivalent to the flat quote — i.e. what the loan really
   * costs. `null` when it is not defined (nothing borrowed, or zero interest).
   */
  effectiveAprPct: number | null;
  /** True when the down payment is under the UAE regulatory minimum. */
  belowRegulatoryMinimum: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Solve for the monthly rate `i` where the present value of the payment stream equals the
 * principal, then annualise it. Bisection rather than Newton-Raphson: the payment-stream PV
 * is monotonically decreasing in `i`, so bisection cannot diverge or oscillate — and a
 * financing number that is slightly slow to compute is far better than one that occasionally
 * fails to converge and renders NaN in front of a user.
 */
function effectiveAprPct(principal: number, monthly: number, months: number): number | null {
  if (principal <= 0 || monthly <= 0 || months <= 0) return null;
  if (monthly * months <= principal) return 0; // no interest charged

  const pv = (i: number) =>
    i === 0 ? monthly * months : (monthly * (1 - Math.pow(1 + i, -months))) / i;

  // 0%..100% per month brackets every real-world consumer loan by a wide margin.
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > principal) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 12 * 100;
}

export function computeFinancing(input: FinancingInput): FinancingPlan {
  const price = Math.max(0, input.priceAed || 0);
  const downPct = clamp(input.downPaymentPct, 0, 100);
  const months = Math.max(1, Math.round(input.tenureMonths));
  const flat = Math.max(0, input.flatRatePct);

  const downPaymentAed = Math.round((price * downPct) / 100);
  const principal = Math.max(0, price - downPaymentAed);

  // Flat interest: charged on the full principal for every year of the term.
  const totalInterest = principal * (flat / 100) * (months / 12);
  const totalPayable = principal + totalInterest;
  const monthly = totalPayable / months;

  return {
    downPaymentAed,
    principalAed: Math.round(principal),
    monthlyAed: Math.round(monthly),
    totalInterestAed: Math.round(totalInterest),
    totalPayableAed: Math.round(totalPayable),
    effectiveAprPct: effectiveAprPct(principal, monthly, months),
    belowRegulatoryMinimum: downPct < UAE_MIN_DOWN_PAYMENT_PCT,
  };
}
