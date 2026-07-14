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

const CITE = /\[([A-Z]\d+)\]/g;

export interface ReportChunk {
  /** literal text (empty for a citation chunk) */
  text: string;
  /** citation id when this chunk is a marker, else null */
  cite: string | null;
  /** when true, no number precedes this marker — it should render as the value */
  injected: boolean;
}

/** True when the last few chars of plain text carry a real digit (a number is inline). */
function tailHasDigit(tail: string): boolean {
  return /\d/.test(tail.slice(-8));
}

/**
 * Tokenize a report into text + citation chunks. `injected` is decided from the
 * *plain text* preceding each marker only — digits inside other [id] tokens never
 * count, so 'to [V3]' after '[V1]' is correctly seen as having no inline number.
 */
export function chunkReport(report: string): ReportChunk[] {
  const chunks: ReportChunk[] = [];
  let last = 0;
  let prevTail = "";
  for (const m of report.matchAll(CITE)) {
    const start = m.index ?? 0;
    if (start > last) {
      const text = report.slice(last, start);
      chunks.push({ text, cite: null, injected: false });
      prevTail = text;
    }
    const injected = !tailHasDigit(prevTail);
    chunks.push({ text: "", cite: m[1], injected });
    // an injected value acts as a number for any marker that immediately follows
    if (injected) prevTail = "0";
    last = start + m[0].length;
  }
  if (last < report.length) chunks.push({ text: report.slice(last), cite: null, injected: false });
  return chunks;
}

/**
 * Resolve a report to plain prose for the PDF: inject the evidenced value when no
 * number precedes a marker, drop the bare [id] when a number is already inline.
 */
export function resolveReportPlain(result: ValuationResult): string {
  const { evidence } = result;
  const out = chunkReport(result.report)
    .map((c) => (c.cite === null ? c.text : c.injected ? displayForCitation(evidence, c.cite) : ""))
    .join("");
  return out
    .replace(/ {2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/,\s*(,|\.)/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+(at|of|from|to|and)\s*([.,;])/gi, "$2")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
