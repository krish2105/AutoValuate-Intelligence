import type { ValuationResult } from "./types";
import { aed, km, titleCase } from "./utils";

type Evidence = ValuationResult["evidence"];

/** Human-readable value for a citation id, drawn from the evidence table. */
export function displayForCitation(evidence: Evidence, id: string): string {
  for (const group of Object.values(evidence)) {
    const d = group?.[id];
    if (!d) continue;
    if (typeof d.aed === "number") return aed(d.aed);
    if (id === "V4" && typeof d.value === "number") return `${Math.round(d.value * 100)}%`;
    if (id === "V5" && typeof d.value === "number") return `${d.value}%`;
    if (typeof d.aed_impact === "number")
      return `${d.aed_impact >= 0 ? "+" : ""}${Math.round(d.aed_impact).toLocaleString("en-AE")} AED`;
    if (d.value !== undefined && d.value !== null) return String(d.value);
    if (typeof d.desc === "string") return d.desc;
  }
  return "";
}

const CITE_SPLIT = /(\[[A-Z]\d+\])/g;
const CITE_ONE = /^\[([A-Z]\d+)\]$/;

/**
 * Some LLM reports place the citation before its number ('range of [V1] AED
 * 51,301'), which reads awkwardly as a leading marker. Move any [id] that is
 * immediately followed by a number to sit after it ('AED 51,301 [V1]'), the
 * convention the rest of the pipeline expects. Idempotent for well-formed text.
 */
export function normalizeCitationOrder(report: string): string {
  let prev: string;
  let out = report;
  do {
    prev = out;
    out = out.replace(/(\[[A-Z]\d+\])(\s*)((?:AED\s*)?[-+]?\d[\d,]*(?:\.\d+)?%?)/g, "$2$3 $1");
  } while (out !== prev);
  return out.replace(/ {2,}/g, " ");
}

export interface ReportChunk {
  /** literal text (empty for a citation chunk) */
  text: string;
  /** citation id when this chunk is a marker, else null */
  cite: string | null;
  /** when true, no number sits on either side of the marker — render it as the value */
  injected: boolean;
}

/**
 * Tokenize a report into text + citation chunks. A marker is `injected` only when
 * neither the plain text before it nor after it carries a digit — digits inside
 * *other* [id] tokens never count. This handles both 'from [V1] to' (blank → inject)
 * and '[V1] AED 23,822' (number follows → keep as bare id, no duplicate).
 */
export function chunkReport(rawReport: string): ReportChunk[] {
  const report = normalizeCitationOrder(rawReport);
  const parts = report.split(CITE_SPLIT); // [text, "[V1]", text, "[V2]", text, ...]
  const chunks: ReportChunk[] = [];
  for (let i = 0; i < parts.length; i++) {
    const m = parts[i].match(CITE_ONE);
    if (!m) {
      if (parts[i]) chunks.push({ text: parts[i], cite: null, injected: false });
      continue;
    }
    const before = (parts[i - 1] ?? "").slice(-8);
    const after = (parts[i + 1] ?? "").slice(0, 8);
    const injected = !/\d/.test(before) && !/\d/.test(after);
    chunks.push({ text: "", cite: m[1], injected });
  }
  return chunks;
}

const _NUMERIC_GROUPS = ["valuation", "drivers", "comparables"];

/** Citation ids that must carry an inline number. */
function numericIds(evidence: Evidence): Set<string> {
  const ids = new Set<string>();
  for (const g of _NUMERIC_GROUPS) for (const id of Object.keys(evidence[g] ?? {})) ids.add(id);
  return ids;
}

/**
 * A report is "messy" when, after normalizing citation order, a numeric fact is
 * still cited without its number written immediately before the marker. Such LLM
 * output reads awkwardly (scattered id chips, orphaned fragments); we swap in the
 * clean deterministic template instead. Mirrors the backend quality gate so the
 * result is pristine even if the backend template fallback hasn't deployed.
 */
export function isMessyReport(report: string, evidence: Evidence): boolean {
  const numeric = numericIds(evidence);
  const parts = normalizeCitationOrder(report).split(CITE_SPLIT);
  for (let i = 0; i < parts.length; i++) {
    const m = parts[i].match(CITE_ONE);
    if (!m || !numeric.has(m[1])) continue;
    const before = (parts[i - 1] ?? "").slice(-8);
    if (!/\d/.test(before)) return true;
  }
  return false;
}

/** Clean, citation-free seller report built deterministically from computed evidence. */
export function buildTemplateReport(r: ValuationResult): string {
  const v = r.valuation;
  const car = `${r.vehicle.year} ${titleCase(String(r.vehicle.make))} ${titleCase(String(r.vehicle.model))}`;
  const factors = v.explanation.top_factors.slice(0, 3)
    .map((f) => `${titleCase(String(f.feature))} (${f.approx_aed_impact >= 0 ? "+" : ""}${Math.round(f.approx_aed_impact).toLocaleString("en-AE")} AED)`)
    .join(", ");
  const comps = r.comparables
    .map((c) => `${c.year} ${titleCase(String(c.make))} ${titleCase(String(c.model))} ${km(c.kilometers)} at ${aed(c.price_aed)}`)
    .join("; ");
  const cond = r.condition.cv_available
    ? `The photo assessment gave a condition score of ${r.condition.condition_score}/100, reflecting detected damage that affects value.`
    : "A visual damage assessment was not available for this valuation, so the estimate assumes market-typical condition — a professional inspection is recommended to confirm.";
  return [
    `Based on the details provided, the ${car} has an estimated fair-market value between ${aed(v.price_low_aed)} and ${aed(v.price_high_aed)}, with a mid-point of ${aed(v.price_mid_aed)}. This range is a calibrated ${Math.round(v.interval_coverage * 100)}% confidence interval.`,
    `The main factors behind this estimate are ${factors}. On held-out testing the pricing model carries a median error of about ${v.model_meta.cv_median_ape_pct}%, so treat the mid-point as a guide, not a guarantee.`,
    cond,
    `Comparable live listings support this range: ${comps}. If confidence is limited or the car has damage beyond what the photos show, a professional inspection is the safest next step before you set a final asking price.`,
  ].join("\n\n");
}

/** The report to display: clean template when the LLM output is messy, else the LLM report. */
export function reportView(r: ValuationResult): { text: string; provider: string; hasCitations: boolean } {
  if (isMessyReport(r.report, r.evidence)) {
    return { text: buildTemplateReport(r), provider: "structured evidence writer", hasCitations: false };
  }
  return { text: normalizeCitationOrder(r.report), provider: r.report_provider, hasCitations: true };
}

/** Resolve a report to plain prose for the PDF (no citation markers). */
export function resolveReportPlain(result: ValuationResult): string {
  const view = reportView(result);
  if (!view.hasCitations) return view.text.trim();
  const { evidence } = result;
  const out = chunkReport(view.text)
    .map((c) => {
      if (c.cite === null) return c.text;
      if (!c.injected) return ""; // number already inline → drop the bare marker
      const v = displayForCitation(evidence, c.cite);
      return /\d/.test(v) ? v : ""; // inject numeric facts only; textual citations (e.g. 'not available') drop
    })
    .join("");
  return out
    .replace(/ {2,}/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/,\s*(,|\.)/g, "$1")
    .replace(/\s+(at|of|from|to|and)\s*([.,;])/gi, "$2")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
