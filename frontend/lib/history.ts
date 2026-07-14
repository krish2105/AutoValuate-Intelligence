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
  const item: HistoryItem = {
    id: `${Date.now()}`,
    ts: Date.now(),
    label: `${v.year} ${v.make} ${v.model}`,
    mid: result.valuation.price_mid_aed,
    result,
  };
  const next = [item, ...loadHistory()].slice(0, 20);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearHistory(): HistoryItem[] {
  localStorage.removeItem(KEY);
  return [];
}
