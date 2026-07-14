import type { ValuationResult } from "./types";
import { aed } from "./utils";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  provider?: string;
  verified?: boolean;
  numbers?: number;
  citations?: number;
}

/**
 * Deterministic, always-grounded answer built entirely from the computed evidence —
 * the client-side twin of `backend-api/agents/chat_agent.py::_fallback`. Used when the
 * backend is cold/unreachable so the assistant still answers with real numbers (and the
 * same [id] citations) instead of failing. Every figure comes from the evidence table,
 * so it is citation-correct by construction and passes the same Verifier rules.
 */
export function localAnswer(question: string, r: ValuationResult): string {
  const q = (question || "").toLowerCase();
  const v = r.valuation;
  const lo = aed(v.price_low_aed);
  const mid = aed(v.price_mid_aed);
  const hi = aed(v.price_high_aed);
  const err = v.model_meta.cv_median_ape_pct;

  const drivers = v.explanation.top_factors.slice(0, 3)
    .map((f, i) => `${f.feature} (${f.approx_aed_impact >= 0 ? "+" : ""}${Math.round(f.approx_aed_impact).toLocaleString("en-AE")} AED [P${i + 1}])`)
    .join(", ") || "the vehicle's core specifications";

  const comps = r.comparables.slice(0, 3)
    .map((c, i) => `${c.year} ${c.make} ${c.model} at ${aed(c.price_aed)} [C${i + 1}]`)
    .join("; ") || "no comparable listings were retrieved";

  // deal / negotiation
  if (/\b(deal|worth it|overpriced|too much|negotiat\w*|offer|fair price|asking)\b/.test(q)) {
    return `Against this car's computed range, the fair mid-point is ${mid} [V2], within a calibrated band from ${lo} [V1] to ${hi} [V3]. Live comparables: ${comps}. Anything meaningfully above ${hi} [V3] sits above the model's fair band — anchor on the mid-point and treat the upper bound as your walk-away.`;
  }
  // condition / damage — checked before mileage/age ("damage" contains "age")
  if (/\b(damage|condition|dent|scratch|repair|photos?|inspect\w*)\b/.test(q)) {
    if (r.condition.cv_available) {
      return `The on-device scan gave a condition score of ${r.condition.condition_score}/100 [D0] from ${r.condition.photos_assessed} photo(s), and that is already reflected in the mid-point of ${mid} [V2]. A professional inspection is still the safest confirmation before you transact.`;
    }
    return `No photo-based damage assessment was run for this valuation [D0], so the estimate assumes market-typical condition. The mid-point of ${mid} [V2] could move once real damage is assessed — upload photos to run the on-device scan, or get a professional inspection.`;
  }
  // why / drivers
  if (/\b(why|driver|factor|shap|explain|impact|affect)\w*\b/.test(q)) {
    return `The mid-point of ${mid} [V2] is driven mainly by ${drivers}. On held-out testing the pricing model carries a median error of about ${err}% [V5], so treat the mid-point as a guide rather than a guarantee.`;
  }
  // mileage / age / what-if
  if (/\b(mileage|kilometres?|kilometers?|km|what[- ]?if|older|newer|age|year)\b/.test(q)) {
    return `Mileage and age are already priced in — the drivers behind this estimate are ${drivers}. To see the effect of a different mileage or year, drag the what-if sliders: they re-run the pricing model directly. The current mid-point is ${mid} [V2].`;
  }
  // comparables
  if (/\b(comparable|similar|listing|market|others)\w*\b/.test(q)) {
    return `The closest live listings retrieved for this car are: ${comps}. Against those, this car's computed mid-point is ${mid} [V2], within a band of ${lo} [V1] to ${hi} [V3].`;
  }
  // default
  return `This car's fair-market estimate is ${mid} [V2], within a calibrated band of ${lo} [V1] to ${hi} [V3]. The main drivers are ${drivers}. Ask me about the price drivers, the comparable listings, the condition, or whether a given asking price is fair.`;
}

export const SUGGESTED_PROMPTS = [
  "Why is it priced this way?",
  "Is this a good deal?",
  "How do the comparables compare?",
  "What about damage?",
];
