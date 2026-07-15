import type { ValuationResult, VehicleInput } from "./types";

/**
 * Deterministic demo result mirroring the real API response shape (from an actual
 * /valuate run). Used only when NEXT_PUBLIC_API_URL is unreachable, so the UI is
 * always demonstrable — the banner makes clear when demo data is shown.
 */
export function demoResult(v: VehicleInput): ValuationResult {
  const mid = 35207;
  return {
    ok: true,
    vehicle: v,
    valuation: {
      price_low_aed: 24234,
      price_mid_aed: mid,
      price_high_aed: 51147,
      interval_coverage: 0.814,
      interval_pct_width: 76.4,
      interval_segment: "mass",
      currency: "AED",
      explanation: {
        baseline_log: 11.2745,
        top_factors: [
          { feature: "noOfCylinders", value: 4, shap_log: -0.2545, approx_aed_impact: -7912 },
          { feature: "age", value: 7, shap_log: -0.2058, approx_aed_impact: -6548 },
          { feature: "bodyType", value: v.bodyType ?? "Sedan", shap_log: -0.1383, approx_aed_impact: -4549 },
          { feature: "make", value: v.make, shap_log: -0.1166, approx_aed_impact: -3874 },
          { feature: "kilometers", value: v.kilometers, shap_log: -0.0565, approx_aed_impact: -1934 },
        ],
      },
      model_meta: { cv_median_ape_pct: 15.87, cv_mae_aed: 33793, training_rows: 671, dataset: "Dubizzle UAE scrape July 2026 (real)" },
    },
    condition: {
      cv_available: false,
      reason: "no CV service configured (demo)",
      condition_score: null,
      price_adjustment_factor: 1.0,
      findings: [],
      photos_assessed: 0,
    },
    comparables: [
      { listing_id: "16893596", url: "https://dubai.dubizzle.com/motors/used-cars/", make: v.make, model: v.model, year: 2019, kilometers: 211457, price_aed: 31000, bodyType: "Sedan", city: "Dubai", sellerType: "Dealer", similarity: 0.954, structured_sim: 0.88 },
      { listing_id: "16874094", url: "https://dubai.dubizzle.com/motors/used-cars/", make: v.make, model: v.model, year: 2018, kilometers: 171000, price_aed: 29999, bodyType: "Sedan", city: "Dubai", sellerType: "Owner", similarity: 0.892, structured_sim: 0.82 },
      { listing_id: "16837245", url: "https://dubai.dubizzle.com/motors/used-cars/", make: v.make, model: v.model, year: 2022, kilometers: 59000, price_aed: 47500, bodyType: "Sedan", city: "Dubai", sellerType: "Dealer", similarity: 0.834, structured_sim: 0.79 },
      { listing_id: "16802511", url: "https://dubai.dubizzle.com/motors/used-cars/", make: v.make, model: v.model, year: 2022, kilometers: 66000, price_aed: 47500, bodyType: "Sedan", city: "Dubai", sellerType: "Dealer", similarity: 0.812, structured_sim: 0.77 },
      { listing_id: "16741980", url: "https://dubai.dubizzle.com/motors/used-cars/", make: v.make, model: v.model, year: 2023, kilometers: 61000, price_aed: 48999, bodyType: "Sedan", city: "Dubai", sellerType: "Dealer", similarity: 0.8, structured_sim: 0.75 },
    ],
    report:
      `Based on the details provided, ${v.year} ${v.make} ${v.model} has an estimated fair-market value between AED 24,234 [V1] and AED 51,147 [V3], with a mid-point of AED 35,207 [V2]. This range is a calibrated 81% confidence interval [V4].\n\n` +
      `The main factors behind this estimate are noOfCylinders (-7,912 AED [P1]), age (-6,548 AED [P2]), bodyType (-4,549 AED [P3]). On held-out testing the pricing model carries a median error of about 15.87% [V5], so treat the mid-point as a guide, not a guarantee.\n\n` +
      `A visual damage assessment was not available for this valuation [D0], so the estimate assumes a market-typical condition — a professional inspection is recommended to confirm.\n\n` +
      `Comparable live listings support this range: 2019 ${v.make} ${v.model} 211457km at AED 31,000 [C1]; 2018 ${v.make} ${v.model} 171000km at AED 29,999 [C2]; 2022 ${v.make} ${v.model} 59000km at AED 47,500 [C3]. If the model's confidence is limited, a professional inspection is the safest next step before you set a final asking price.`,
    report_provider: "template",
    evidence: {
      valuation: { V1: { label: "estimated low", aed: 24234 }, V2: { label: "estimated mid", aed: mid }, V3: { label: "estimated high", aed: 51147 }, V4: { label: "interval coverage", value: 0.814 }, V5: { label: "model median error %", value: 15.87 } },
      condition: { D0: { label: "visual inspection", value: "not available" } },
      comparables: {},
      drivers: {},
    },
    verification: { passed: true, violations: [], numbers_checked: 13, citations_checked: 14 },
    confidence: {
      level: "medium",
      valuation_interval_pct: 76.4,
      cv_assessed: false,
      reasons: ["wide price interval (±38% around mid)", "no visual damage assessment was performed"],
      recommend_professional_inspection: true,
      statement:
        "Confidence in this estimate is moderate. No photo-based damage assessment was performed, so the figure assumes market-typical condition. We recommend a professional inspection before relying on this number for a transaction. This is an automated estimate, not a certified appraisal.",
    },
    trace: [
      { step: "intake", status: "ok", detail: `${v.year} ${v.make} ${v.model}, ${v.kilometers.toLocaleString()} km` },
      { step: "aggregation", status: "ok", detail: "CV skipped (demo mode)" },
      { step: "valuation", status: "ok", detail: "AED 24,234–51,147 (mid 35,207)" },
      { step: "comparables", status: "ok", detail: "5 comparables, top match 0.95" },
      { step: "report", status: "ok", detail: "written via template" },
      { step: "verifier", status: "ok", detail: "13 numbers, 14 citations, all grounded" },
      { step: "confidence", status: "ok", detail: "confidence: medium" },
    ],
  };
}
