"use client";
import { motion } from "framer-motion";
import { TrendingUp, Info } from "lucide-react";
import type { Valuation } from "@/lib/types";
import { aed } from "@/lib/utils";
import { SectionCard, Pill } from "./ui";
import { ShapWaterfall } from "./shap-waterfall";
import { CountUp } from "./fx";

export function ValuationDashboard({ v }: { v: Valuation }) {
  const span = v.price_high_aed - v.price_low_aed;
  const midPct = span > 0 ? ((v.price_mid_aed - v.price_low_aed) / span) * 100 : 50;

  return (
    <SectionCard
      title="Fair-market valuation"
      subtitle={`Calibrated ${Math.round(v.interval_coverage * 100)}% confidence range${v.condition_adjusted ? " · condition-adjusted" : ""}`}
      icon={<TrendingUp className="h-4.5 w-4.5" />}
      right={<Pill tone="info">± {(v.interval_pct_width / 2).toFixed(0)}%</Pill>}
    >
      {/* spec-sheet headline row — odometer sweep on the price */}
      <div className="mb-1 flex items-end justify-between gap-4">
        <div>
          <p className="mb-1 font-display text-[10px] font-medium uppercase tracking-[0.22em] text-muted">Estimated value</p>
          <p className="display-title text-3xl font-bold sm:text-5xl">
            <span className="mr-1.5 align-top text-sm font-semibold text-muted sm:text-base">AED</span>
            <CountUp value={v.price_mid_aed} className="tracking-tight text-accent" />
          </p>
        </div>
        <div className="text-right">
          <div className="border-l pl-4 hairline">
            <p className="font-display text-[10px] uppercase tracking-[0.18em] text-muted">median error</p>
            <p className="tnum text-sm font-semibold">{v.model_meta.cv_median_ape_pct}%</p>
            <p className="mt-1 font-display text-[10px] uppercase tracking-[0.18em] text-muted">training rows</p>
            <p className="tnum text-sm font-semibold">{v.model_meta.training_rows}</p>
          </div>
        </div>
      </div>

      {/* animated range gauge */}
      <div className="mb-6 mt-4">
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-2">
          <motion.div
            initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: "left" }}
            className="h-full rounded-full bg-gradient-to-r from-info/70 via-accent to-good/70"
          />
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
            style={{ left: `${midPct}%` }}
            className="absolute top-1/2 h-6 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg shadow-lift ring-2 ring-bg"
          />
        </div>
        <div className="mt-2 flex justify-between text-xs">
          <span className="tnum text-muted">{aed(v.price_low_aed)}</span>
          <span className="tnum font-medium text-accent">mid {aed(v.price_mid_aed)}</span>
          <span className="tnum text-muted">{aed(v.price_high_aed)}</span>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted">
        <Info className="h-3.5 w-3.5" /> Why this price — SHAP feature impact (AED)
      </div>
      <ShapWaterfall factors={v.explanation.top_factors} />
    </SectionCard>
  );
}
