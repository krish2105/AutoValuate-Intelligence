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

/** True when a real digit already sits just before this token (number is inline). */
function numberPrecedes(text: string, offset: number): boolean {
  return /\d/.test(text.slice(Math.max(0, offset - 8), offset));
}

/**
 * Resolve a report to plain prose: when a citation has no inline number in front
 * of it, substitute the evidenced value so the sentence never reads blank; when a
 * number is already inline, drop the bare [id] marker. Used for the PDF export.
 */
export function resolveReportPlain(result: ValuationResult): string {
  const { report, evidence } = result;
  const out = report.replace(CITE, (_full, id: string, offset: number) => {
    if (numberPrecedes(report, offset)) return "";
    return displayForCitation(evidence, id);
  });
  // tidy the seams left by removed/added tokens
  return out
    .replace(/ {2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export interface ReportChunk {
  text: string;
  /** citation id when this chunk is a marker, else null */
  cite: string | null;
  /** when true, the marker replaces a missing number and should show the value */
  injected: boolean;
}

/** Split a paragraph into text + citation chunks for the interactive web renderer. */
export function chunkParagraph(paragraph: string, fullReport: string, base: number): ReportChunk[] {
  const chunks: ReportChunk[] = [];
  let last = 0;
  for (const m of paragraph.matchAll(CITE)) {
    const start = m.index ?? 0;
    if (start > last) chunks.push({ text: paragraph.slice(last, start), cite: null, injected: false });
    const globalOffset = base + start;
    chunks.push({ text: "", cite: m[1], injected: !numberPrecedes(fullReport, globalOffset) });
    last = start + m[0].length;
  }
  if (last < paragraph.length) chunks.push({ text: paragraph.slice(last), cite: null, injected: false });
  return chunks;
}
