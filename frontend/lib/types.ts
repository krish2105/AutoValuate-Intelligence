/**
 * The vehicle attributes the valuation model actually consumes. This is the ONLY part of
 * the form that describes the car; everything else in `VehicleInput` is local to the
 * browser. Kept as its own type so the wire format can be built by naming these fields
 * explicitly rather than by subtracting the ones we happen to remember are private.
 */
export interface VehicleAttributes {
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
}

/**
 * Browser-only form state. Holds fields that must never reach the backend
 * (`photos`, `asking_price_aed`) alongside the ones that must. Do not send this object
 * anywhere — pass it through `toBackendRequest()`, which is the only supported wire path.
 */
export interface VehicleInput extends VehicleAttributes {
  /**
   * Optional asking/listed price, used ONLY for the deal score (E4). It is deliberately not
   * a model feature and is never sent to /valuate — telling the model the asking price would
   * let it anchor to it, and the whole point is an independent second opinion.
   */
  asking_price_aed?: number | null;
  /**
   * Base64 `data:` URLs held in memory for the on-device scan and the thumbnail strip.
   * NEVER transmitted — the product's headline claim is that photos stay on the device
   * ("photos never leave your browser"). The scan runs here; only its derived
   * `client_condition` is sent. See `toBackendRequest`.
   */
  photos?: string[];
  /** Optional on-device (browser CV) condition — see lib/cv-browser.ClientCondition. */
  client_condition?: import("./cv-browser").ClientCondition | null;
}

/**
 * Exactly what crosses the network for a valuation. Photos are absent *by construction*
 * rather than by removal: the type has no field to put them in, so a future field added
 * to the form cannot silently ride along.
 *
 * The backend gets the derived condition plus enough provenance (`photo_count`,
 * `photo_set_hash`) to check that the condition belongs to the photo set being valued,
 * without ever receiving the pixels.
 */
export interface BackendValuationRequest extends VehicleAttributes {
  client_condition?: import("./cv-browser").ClientCondition | null;
  /** How many photos the user selected — lets the backend sanity-check `photos_assessed`. */
  photo_count: number;
  /** Identity of the ordered photo set (lib/cv/hashes.photoSetHash), or "empty" for none. */
  photo_set_hash: string;
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
  /**
   * Worst pixel-graded severity band for this class (cv-browser.severityOf).
   *
   * Optional because a demo/older backend may omit it. Its ABSENCE here was the bug: the
   * CV pipeline graded severity from the crop's pixels, `DamageFindingClient` carried it,
   * and then widening to this type silently dropped it — so repair-estimate.tsx re-derived
   * severity from `max_confidence` instead, pricing model certainty rather than damage.
   */
  severity?: "minor" | "moderate" | "severe";
}

export interface Condition {
  cv_available: boolean;
  reason?: string;
  condition_score: number | null;
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
