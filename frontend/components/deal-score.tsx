"use client";
import { useMemo } from "react";
import { Tag, TrendingDown, TrendingUp } from "lucide-react";
import type { ValuationResult } from "@/lib/types";
import { dealScore, type DealVerdict } from "@/lib/deal-score";
import { aed, cn } from "@/lib/utils";
import { SectionCard, Pill } from "./ui";
import { CountUp } from "./fx";

/**
 * E4 — deal score. Renders only when the user supplied an asking price; the number stays
 * client-side (see lib/api.ts:toApiVehicle) so the model can never anchor to it.
 */

const TONE: Record<DealVerdict, { text: string; bar: string; pill: "good" | "warn" | "bad" | "info" }> = {
  great:      { text: "text-good",  bar: "bg-good",  pill: "good" },
  good:       { text: "text-good",  bar: "bg-good",  pill: "good" },
  fair:       { text: "text-info",  bar: "bg-info",  pill: "info" },
  high:       { text: "text-warn",  bar: "bg-warn",  pill: "warn" },
  overpriced: { text: "text-bad",   bar: "bg-bad",   pill: "bad" },
};

export function DealScore({ result, asking }: { result: ValuationResult; asking?: number | null }) {
  const d = useMemo(
    () => (asking ? dealScore(result.valuation, asking) : null),
    [result.valuation, asking],
  );
  if (!d) return null;

  const t = TONE[d.verdict];
  const cheaper = d.deltaAed < 0;

  return (
    <SectionCard
      title="Deal score"
      subtitle={`Asking ${aed(asking!)} vs the model's fair value`}
      icon={<Tag className="h-4.5 w-4.5" />}
      right={<Pill tone={t.pill}>{d.label}</Pill>}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="shrink-0">
          <p className={cn("font-display text-5xl font-bold tnum", t.text)}>
            <CountUp value={d.score} />
            <span className="ml-1 text-xl text-muted">/100</span>
          </p>
          <p className="mt-1 text-xs text-muted">higher = better value</p>
        </div>

        <div className="min-w-0 flex-1">
          {/* Position of the asking price across the model's predictive distribution. */}
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className={cn("h-full rounded-full transition-all", t.bar)} style={{ width: `${d.score}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-wider text-muted">
            <span>overpriced</span><span>fair</span><span>bargain</span>
          </div>

          <p className="mt-3 text-sm text-fg/85">
            {cheaper ? <TrendingDown className="mr-1 inline h-4 w-4 text-good" /> : <TrendingUp className="mr-1 inline h-4 w-4 text-warn" />}
            Asking is <span className={cn("font-semibold tnum", cheaper ? "text-good" : "text-warn")}>
              {aed(Math.abs(d.deltaAed))} {cheaper ? "below" : "above"}
            </span>{" "}
            the estimated fair value of <span className="tnum text-fg">{aed(result.valuation.price_mid_aed)}</span>
            {" "}({d.deltaPct > 0 ? "+" : ""}{d.deltaPct}%).
          </p>
          <p className="mt-1.5 text-xs text-muted">
            About <span className="tnum text-fg">{Math.round(d.percentile * 100)}%</span> of comparable
            {" "}{result.vehicle.make} {result.vehicle.model}s are worth less than this asking price, based on the
            {" "}{Math.round(result.valuation.interval_coverage * 100)}%-covered interval for
            {" "}{result.valuation.interval_segment ?? "this"} cars. Treat it as a band, not a verdict — the
            score carries a few points of error, and condition and history still decide the last mile.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
