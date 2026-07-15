/**
 * Human labels for model feature names — shared by the SHAP waterfall (per-car) and the SHAP
 * beeswarm (market-wide), so the same feature never gets two different names on one page.
 *
 * `mileage_per_year` is kept deliberately: the model dropped it in the B3 ablation, but old
 * saved/shared valuations still carry it, and an unlabelled raw key is worse than a label.
 */
export const FEATURE_LABEL: Record<string, string> = {
  noOfCylinders: "Engine size", year: "Model year", bodyType: "Body type",
  make: "Make", model: "Model", kilometers: "Mileage", mileage_per_year: "Km / year",
  transmissionType: "Transmission", fuelType: "Fuel", regionalSpecs: "Specs",
  city: "City", sellerType: "Seller", age: "Age",
};
