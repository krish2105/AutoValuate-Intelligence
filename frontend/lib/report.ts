import type { ValuationResult } from "./types";
import { aed } from "./utils";

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
export function chunkReport(report: string): ReportChunk[] {
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

/**
 * Resolve a report to plain prose for the PDF: inject the evidenced value when no
 * number precedes a marker, drop the bare [id] when a number is already inline.
 */
export function resolveReportPlain(result: ValuationResult): string {
  const { evidence } = result;
  const out = chunkReport(result.report)
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
