export interface VehicleInput {
  make: string;
  model: string;
  year: number;
  kilometers: number;
  bodyType?: string;
  transmissionType?: string;
  fuelType?: string;
  regionalSpecs?: string;
  noOfCylinders?: number | null;
  city?: string;
  sellerType?: string;
  /**
   * Optional asking/listed price, used ONLY for the deal score (E4). It is deliberately not
   * a model feature and is never sent to /valuate — telling the model the asking price would
   * let it anchor to it, and the whole point is an independent second opinion.
   */
  asking_price_aed?: number | null;
  photos?: string[];
  /** Optional on-device (browser CV) condition — see lib/cv-browser.ClientCondition. */
  client_condition?: import("./cv-browser").ClientCondition | null;
}

export interface TraceStep {
  step: string;
  status: "ok" | "error" | "flagged";
  detail: string;
}

export interface ShapFactor {
  feature: string;
  value: string | number | null;
  shap_log: number;
  approx_aed_impact: number;
}

export interface Valuation {
  price_low_aed: number;
  price_mid_aed: number;
  price_high_aed: number;
  /** Coverage measured for THIS car's segment (Mondrian conformal), not the overall average. */
  interval_coverage: number;
  interval_pct_width: number;
  /** Brand tier the interval was calibrated on: "luxury" | "mass" (or "global" pre-Mondrian). */
  interval_segment?: string;
  currency: string;
  explanation: { baseline_log: number; top_factors: ShapFactor[] };
  model_meta: {
    /** Content hash of the artifact that priced this car (WS E3) — makes a valuation attributable. */
    model_version?: string;
    cv_median_ape_pct: number;
    cv_mae_aed: number;
    training_rows: number;
    dataset: string;
  };
  condition_adjusted?: boolean;
  condition_factor?: number;
}

export interface DamageFinding {
  damage_type: string;
  instances: number;
  max_confidence: number;
  photos_with_damage: number[];
  value_impact_pct: number;
  severity?: string;
  /** Capture angles ("front", "rear-left", …) this damage appeared in — guided scans only. */
  angles_with_damage?: string[];
  /** Confidence below the verify threshold — show as "possible, verify in person". */
  uncertain?: boolean;
}

export interface Condition {
  cv_available: boolean;
  reason?: string;
  condition_score: number | null;
  /** [worst, best] case score under the detector's held-out per-class error rates. */
  score_band?: [number, number];
  price_adjustment_factor: number;
  findings: DamageFinding[];
  photos_assessed: number;
  total_value_impact_pct?: number;
  /** "browser" when the scan ran on-device (Phase A WASM CV). */
  source?: string;
}

export interface Comparable {
  listing_id: string;
  url: string;
  make: string;
  model: string;
  year: number;
  kilometers: number;
  price_aed: number;
  bodyType: string;
  city: string;
  sellerType: string;
  similarity: number;
  structured_sim: number;
  /**
   * E5 — present only when this listing is priced below ~2.5% of genuine comparable cars,
   * i.e. implausibly cheap for its own specs. Absent for ordinary listings.
   */
  price_anomaly?: {
    fair_price_aed: number;
    below_fair_pct: number;
    reason: string;
  };
}

export interface Confidence {
  level: "high" | "medium" | "low";
  valuation_interval_pct: number;
  cv_assessed: boolean;
  reasons: string[];
  recommend_professional_inspection: boolean;
  statement: string;
}

export interface Verification {
  passed: boolean;
  violations: string[];
  numbers_checked: number;
  citations_checked: number;
}

export interface RepairItem {
  damage_type: string;
  instances: number;
  severity: "minor" | "moderate" | "severe";
  low_aed: number;
  high_aed: number;
}

export interface RepairEstimate {
  available: boolean;
  items: RepairItem[];
  total_low_aed: number;
  total_high_aed: number;
}

export interface ValuationResult {
  ok: boolean;
  error?: string;
  vehicle: VehicleInput;
  valuation: Valuation;
  condition: Condition;
  repair?: RepairEstimate;
  comparables: Comparable[];
  report: string;
  report_provider: string;
  evidence: Record<string, Record<string, any>>;
  verification: Verification;
  confidence: Confidence;
  trace: TraceStep[];
}
