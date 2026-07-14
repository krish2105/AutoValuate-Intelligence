"use client";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldAlert, ShieldX, Stethoscope } from "lucide-react";
import type { Confidence } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RadialGauge } from "./gauges";

const MAP = {
  high: { icon: ShieldCheck, tone: "text-good", ring: "ring-good/30 bg-good/8", label: "High confidence", gauge: "good", score: 88 },
  medium: { icon: ShieldAlert, tone: "text-warn", ring: "ring-warn/30 bg-warn/8", label: "Moderate confidence", gauge: "warn", score: 66 },
  low: { icon: ShieldX, tone: "text-bad", ring: "ring-bad/30 bg-bad/8", label: "Limited confidence", gauge: "bad", score: 42 },
} as const;

export function ConfidencePanel({ c }: { c: Confidence }) {
  const m = MAP[c.level];
  const Icon = m.icon;
  // Trust score: anchored by level, nudged down for a wider interval. Purely a visual
  // summary of the honest signals already in `c` — no new claims.
  const width = c.valuation_interval_pct || 0;
  const trust = Math.max(20, Math.min(97, Math.round(m.score - Math.max(0, width - 60) * 0.15)));
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn("rounded-2xl border p-5 ring-1", m.ring)}
    >
      <div className="flex items-start gap-4">
        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface", m.tone)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn("text-sm font-semibold", m.tone)}>{m.label}</h3>
            {c.recommend_professional_inspection && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">
                <Stethoscope className="h-3 w-3" /> inspection advised
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-fg/85">{c.statement}</p>
          {c.reasons.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {c.reasons.map((r, i) => (
                <li key={i} className="rounded-md bg-surface px-2 py-1 text-[11px] text-muted">{r}</li>
              ))}
            </ul>
          )}
        </div>
        {/* confidence gauge (Phase L) */}
        <div className="hidden shrink-0 flex-col items-center sm:flex">
          <RadialGauge value={trust} tone={m.gauge} size={112}
            label="trust" sublabel={`±${Math.round(width / 2)}% band`} />
        </div>
      </div>
    </motion.div>
  );
}
