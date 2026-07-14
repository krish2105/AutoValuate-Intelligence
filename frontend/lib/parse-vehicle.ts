import type { VehicleInput } from "./types";

/**
 * M7 — "describe your car" intake.
 *
 * Parses a free-text sentence ("2019 Toyota Corolla GCC, 90k km, automatic petrol sedan")
 * into the structured form. Deliberately deterministic rather than LLM-backed: it runs
 * instantly, offline, costs nothing, and — unlike a model — can never hallucinate a spec
 * the user didn't say. Anything it can't find is simply left alone for the user to set.
 */

const MAKES = [
  "toyota", "nissan", "honda", "mitsubishi", "mazda", "lexus", "infiniti", "suzuki",
  "hyundai", "kia", "genesis", "ford", "chevrolet", "gmc", "jeep", "dodge", "cadillac",
  "bmw", "mercedes-benz", "mercedes", "audi", "volkswagen", "porsche", "mini",
  "land rover", "range rover", "jaguar", "bentley", "rolls-royce", "aston martin",
  "volvo", "peugeot", "renault", "skoda", "seat", "fiat", "alfa romeo",
  "tesla", "ferrari", "lamborghini", "maserati", "mg", "chery", "geely", "haval",
];

const BODY = ["suv", "sedan", "coupe", "hatchback", "pick up truck", "pickup", "truck", "van", "convertible", "wagon"];
const SPECS = ["gcc", "american", "european", "japanese", "canadian", "korean", "chinese", "other"];
const FUEL = ["petrol", "gasoline", "diesel", "hybrid", "electric", "ev"];
const CITY = ["dubai", "abu dhabi", "sharjah", "ajman", "ras al khaimah", "al ain", "fujairah"];

const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export interface ParsedVehicle extends Partial<VehicleInput> {
  /** fields we actually recognised, for user feedback */
  matched: string[];
}

export function parseVehicle(text: string): ParsedVehicle {
  const t = ` ${text.toLowerCase().replace(/[,;]/g, " ")} `;
  const out: ParsedVehicle = { matched: [] };
  const hit = (k: string) => out.matched.push(k);

  // year — 1980..2026, avoid matching a mileage like "2019 km"
  const year = t.match(/\b(19[89]\d|20[0-2]\d)\b(?!\s*(?:km|kms|kilometers?|kilometres?))/);
  if (year) { out.year = Number(year[1]); hit("year"); }

  // mileage — "90k km", "90,000 km", "90000km", "120 000 kms"
  const kmMatch =
    t.match(/\b(\d{1,3}(?:[\s,]\d{3})+|\d+(?:\.\d+)?)\s*k?\s*(?:km|kms|kilometers?|kilometres?)\b/) ||
    t.match(/\b(\d+(?:\.\d+)?)\s*k\b/);
  if (kmMatch) {
    const raw = kmMatch[1].replace(/[\s,]/g, "");
    let n = Number(raw);
    // "90k" / "90 k km" → thousands
    if (/k/.test(kmMatch[0]) && !/\d{4,}/.test(raw)) n *= 1000;
    if (Number.isFinite(n) && n >= 0 && n <= 1_000_000) { out.kilometers = Math.round(n); hit("mileage"); }
  }

  // make (longest match first so "range rover" beats "rover", "mercedes-benz" beats "mercedes")
  const make = [...MAKES].sort((a, b) => b.length - a.length).find((m) => t.includes(` ${m} `) || t.includes(` ${m}`));
  if (make) {
    out.make = cap(make);
    hit("make");
    // model = the 1-3 words right after the make, minus known spec words
    const after = t.split(make)[1] ?? "";
    const stop = new Set([...BODY, ...SPECS, ...FUEL, ...CITY, "automatic", "manual", "km", "kms", "cylinder", "cylinders", "with", "and", "a", "the", "small", "big", "dent", "scratch", "damage"]);
    const words = after.trim().split(/\s+/).filter(Boolean);
    const model: string[] = [];
    for (const w of words) {
      const clean = w.replace(/[^a-z0-9-]/g, "");
      // stop at a spec word or anything that starts with a digit — "45k", "90,000", "2019"
      // are mileage/year tokens, never part of the model name ("Patrol 45k" was a real bug).
      if (!clean || stop.has(clean) || /^\d/.test(clean)) break;
      model.push(clean);
      if (model.length === 3) break;
    }
    if (model.length) { out.model = cap(model.join(" ")); hit("model"); }
  }

  // canonical labels must match the form's <select> options exactly, or the value won't stick
  const BODY_LABEL: Record<string, string> = {
    suv: "SUV", sedan: "Sedan", coupe: "Coupe", hatchback: "Hatchback",
    "pick up truck": "Pick Up Truck", pickup: "Pick Up Truck", truck: "Pick Up Truck",
    van: "Van", convertible: "Convertible", wagon: "Wagon",
  };
  const body = BODY.find((b) => t.includes(` ${b} `));
  if (body) { out.bodyType = BODY_LABEL[body]; hit("body"); }

  const spec = SPECS.find((s) => t.includes(` ${s} `));
  if (spec) { out.regionalSpecs = spec === "gcc" ? "GCC" : cap(spec); hit("specs"); }

  const fuel = FUEL.find((f) => t.includes(` ${f} `));
  if (fuel) {
    out.fuelType = fuel === "gasoline" ? "Petrol" : fuel === "ev" ? "Electric" : cap(fuel);
    hit("fuel");
  }

  if (/\bmanual\b/.test(t)) { out.transmissionType = "Manual"; hit("transmission"); }
  else if (/\bautomatic\b|\bauto\b/.test(t)) { out.transmissionType = "Automatic"; hit("transmission"); }

  const city = CITY.find((c) => t.includes(` ${c} `));
  if (city) { out.city = cap(city); hit("city"); }

  const cyl = t.match(/\b(\d{1,2})\s*(?:cyl|cylinders?)\b/);
  if (cyl) {
    const n = Number(cyl[1]);
    if (n >= 0 && n <= 16) { out.noOfCylinders = n; hit("cylinders"); }
  }

  return out;
}
