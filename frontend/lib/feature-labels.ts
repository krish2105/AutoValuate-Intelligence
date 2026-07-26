/**
 * Human labels for model feature names — shared by the SHAP waterfall (per-car) and the SHAP
 * beeswarm (market-wide), so the same feature never gets two different names on one page.
 * Mirrored by FEATURE_LABEL in backend-api/agents/report_agent.py for the seller report and
 * chat assistant — keep both files in sync when a feature is added or renamed.
 *
 * `mileage_per_year` is kept deliberately: the model dropped it in the B3 ablation, but old
 * saved/shared valuations still carry it, and an unlabelled raw key is worse than a label.
 *
 * The spec_* entries were missing from this map for a while after the spec-join retrain
 * shipped (048c4bb/bccc4ec) — the raw keys leaked straight into the report ("Spec_torque").
 */
export const FEATURE_LABEL: Record<string, string> = {
  noOfCylinders: "Engine size", year: "Model year", bodyType: "Body type",
  make: "Make", model: "Model", kilometers: "Mileage", mileage_per_year: "Km / year",
  transmissionType: "Transmission", fuelType: "Fuel", regionalSpecs: "Specs",
  city: "City", sellerType: "Seller", age: "Age",
  spec_hp: "Horsepower", spec_torque: "Torque", spec_l100km: "Fuel economy",
  spec_0to100: "0-100 km/h", spec_topspeed: "Top speed", spec_weight: "Weight",
};
