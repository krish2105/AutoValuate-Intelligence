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
  photos?: string[];
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
  interval_coverage: number;
  interval_pct_width: number;
  currency: string;
  explanation: { baseline_log: number; top_factors: ShapFactor[] };
  model_meta: { cv_median_ape_pct: number; cv_mae_aed: number; training_rows: number; dataset: string };
  condition_adjusted?: boolean;
  condition_factor?: number;
}

export interface DamageFinding {
  damage_type: string;
  instances: number;
  max_confidence: number;
  photos_with_damage: number[];
  value_impact_pct: number;
}

export interface Condition {
  cv_available: boolean;
  reason?: string;
  condition_score: number | null;
  price_adjustment_factor: number;
  findings: DamageFinding[];
  photos_assessed: number;
  total_value_impact_pct?: number;
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

export interface ValuationResult {
  ok: boolean;
  error?: string;
  vehicle: VehicleInput;
  valuation: Valuation;
  condition: Condition;
  comparables: Comparable[];
  report: string;
  report_provider: string;
  evidence: Record<string, Record<string, any>>;
  verification: Verification;
  confidence: Confidence;
  trace: TraceStep[];
}
