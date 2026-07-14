import type { ValuationResult } from "./types";

const KEY = "autovaluate.history.v1";

export interface HistoryItem {
  id: string;
  ts: number;
  label: string;
  mid: number;
  result: ValuationResult;
}

export function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveToHistory(result: ValuationResult): HistoryItem[] {
  const v = result.vehicle;
  // Never persist base64 photos into localStorage — they blow the ~5 MB quota.
  const slim: ValuationResult = { ...result, vehicle: { ...v, photos: [] } };
  const item: HistoryItem = {
    id: `${Date.now()}`,
    ts: Date.now(),
    label: `${v.year} ${v.make} ${v.model}`,
    mid: result.valuation.price_mid_aed,
    result: slim,
  };
  const next = [item, ...loadHistory()].slice(0, 20);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // quota exceeded — drop the oldest half and retry once, then give up quietly
    try {
      localStorage.setItem(KEY, JSON.stringify(next.slice(0, 10)));
    } catch {
      /* history is best-effort; never let it break the app */
    }
  }
  return next;
}

export function clearHistory(): HistoryItem[] {
  localStorage.removeItem(KEY);
  return [];
}
