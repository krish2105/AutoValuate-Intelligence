import { demoResult } from "../lib/demo";
import type { ValuationResult, VehicleInput } from "../lib/types";

/**
 * Fixture built from the app's own demoResult() rather than hand-written.
 *
 * demoResult mirrors a real /valuate response and is maintained alongside the types, so a
 * new required field can't quietly turn these tests into "app renders an error boundary and
 * every assertion vacuously passes" — which is exactly what a hand-rolled payload did.
 */
export const VEHICLE: VehicleInput = {
  make: "toyota", model: "corolla", year: 2019, kilometers: 90000, bodyType: "Sedan",
  transmissionType: "Automatic", fuelType: "Petrol", regionalSpecs: "GCC",
  sellerType: "Dealer", city: "Dubai", noOfCylinders: 4,
};

const base = demoResult(VEHICLE);

export const VALUATION: ValuationResult = {
  ...base,
  comparables: [
    { ...base.comparables[0], listing_id: "A1", price_aed: 44000, similarity: 0.95 },
    // The flagged one — the backend already decided this listing is implausible.
    {
      ...base.comparables[1], listing_id: "B2", price_aed: 12000, similarity: 0.93,
      price_anomaly: {
        fair_price_aed: 45330, below_fair_pct: 73.5,
        reason: "Priced 74% below the 45,330 AED this car's own specs predict — worth verifying.",
      },
    },
  ],
};
