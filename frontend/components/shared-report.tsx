"use client";
import type { ValuationResult } from "@/lib/types";
import { ConfidencePanel } from "./confidence-panel";
import { ValuationDashboard } from "./valuation-dashboard";
import { DamageReport } from "./damage-report";
import { MarketAnalytics } from "./market-analytics";
import { Comparables } from "./comparables";
import { SellerReport } from "./seller-report";

/**
 * Read-only view of a shared valuation (Phase D). Reuses the exact same result
 * components as the live app — so a shared link shows the identical explainability
 * (SHAP drivers, comparables, citation-grounded report) rather than a lossy summary.
 * Interactive-only surfaces (form, what-if, assistant, history) are deliberately absent.
 */
export function SharedReport({ result }: { result: ValuationResult }) {
  return (
    <div className="space-y-5">
      <ConfidencePanel c={result.confidence} />
      <ValuationDashboard v={result.valuation} />
      <DamageReport c={result.condition} />
      <MarketAnalytics result={result} />
      <Comparables items={result.comparables} />
      <SellerReport result={result} />
    </div>
  );
}
