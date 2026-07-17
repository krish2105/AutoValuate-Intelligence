import type { VehicleInput } from "./types";
import { assessmentBand, SYNTHETIC_PROVENANCE, type ClientCondition } from "./cv-browser";

/**
 * One-click sample vehicles for the demo garage. Each preset fills the form and runs
 * the full pipeline instantly — even offline (the API falls back to the deterministic
 * demo result, and any `client_condition` is folded in by lib/api.withClientCondition).
 *
 * The damaged preset carries a synthetic on-device condition so a judge can see the CV
 * → price → negotiation flow without needing to upload a real damaged-car photo. It is
 * clearly labelled "sample" in the UI.
 */
export interface DemoCar {
  id: string;
  name: string;
  tagline: string;
  emoji: string;
  accent: "info" | "good" | "warn" | "accent";
  input: VehicleInput;
}

function condition(findings: ClientCondition["findings"]): ClientCondition {
  let deduction = 0;
  for (const f of findings) deduction += f.value_impact_pct / 100;
  deduction = Math.min(deduction, 0.55);
  const score = Math.round(100 * (1 - deduction));
  // Hand-authored showcase fixtures — no photos, no detector ran. Marked "synthetic" so a
  // demo car can never be mistaken (by the backend, or by anyone tracing a price) for a
  // real scan of real photos.
  return {
    ...SYNTHETIC_PROVENANCE,
    cv_available: true,
    condition_score: score,
    price_adjustment_factor: Math.round((1 - deduction) * 1e4) / 1e4,
    findings,
    photos_assessed: findings.reduce((n, f) => Math.max(n, ...f.photos_with_damage, 0), 0) + 1,
    total_value_impact_pct: Math.round(deduction * 100 * 10) / 10,
    assessment: assessmentBand(score),
    needs_inspection: score < 70 || findings.some((f) => f.severity === "severe"),
  };
}

export const DEMO_CARS: DemoCar[] = [
  {
    id: "clean-sedan",
    name: "Clean commuter",
    tagline: "2021 Toyota Corolla · 48k km · one owner",
    emoji: "🚗",
    accent: "good",
    input: {
      make: "Toyota", model: "Corolla", year: 2021, kilometers: 48000,
      bodyType: "Sedan", transmissionType: "Automatic", fuelType: "Petrol",
      regionalSpecs: "GCC", noOfCylinders: 4, city: "Dubai", sellerType: "Owner",
      photos: [], client_condition: null,
    },
  },
  {
    id: "damaged-suv",
    name: "Accident-repaired SUV",
    tagline: "2019 Nissan Patrol · 120k km · visible damage",
    emoji: "🛻",
    accent: "warn",
    input: {
      make: "Nissan", model: "Patrol", year: 2019, kilometers: 120000,
      bodyType: "SUV", transmissionType: "Automatic", fuelType: "Petrol",
      regionalSpecs: "GCC", noOfCylinders: 8, city: "Abu Dhabi", sellerType: "Dealer",
      photos: [],
      client_condition: condition([
        { damage_type: "dent", instances: 3, max_confidence: 0.74, photos_with_damage: [0, 1], value_impact_pct: 4.0, severity: "moderate" },
        { damage_type: "scratch", instances: 2, max_confidence: 0.58, photos_with_damage: [0], value_impact_pct: 1.5, severity: "minor" },
        { damage_type: "lamp_broken", instances: 1, max_confidence: 0.81, photos_with_damage: [2], value_impact_pct: 2.0, severity: "minor" },
      ]),
    },
  },
  {
    id: "luxury-coupe",
    name: "Luxury coupe",
    tagline: "2022 Mercedes-Benz C-Class · 32k km · pristine",
    emoji: "🏎️",
    accent: "info",
    input: {
      make: "Mercedes-Benz", model: "C-Class", year: 2022, kilometers: 32000,
      bodyType: "Coupe", transmissionType: "Automatic", fuelType: "Petrol",
      regionalSpecs: "GCC", noOfCylinders: 6, city: "Dubai", sellerType: "Owner",
      photos: [], client_condition: null,
    },
  },
];
