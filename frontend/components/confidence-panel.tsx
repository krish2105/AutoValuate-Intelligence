"use client";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldAlert, ShieldX, Stethoscope } from "lucide-react";
import type { Confidence } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAP = {
  high: { icon: ShieldCheck, tone: "text-good", ring: "ring-good/30 bg-good/8", label: "High confidence" },
  medium: { icon: ShieldAlert, tone: "text-warn", ring: "ring-warn/30 bg-warn/8", label: "Moderate confidence" },
  low: { icon: ShieldX, tone: "text-bad", ring: "ring-bad/30 bg-bad/8", label: "Limited confidence" },
} as const;

export function ConfidencePanel({ c }: { c: Confidence }) {
  const m = MAP[c.level];
  const Icon = m.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn("rounded-2xl border p-5 ring-1", m.ring)}
    >
      <div className="flex items-start gap-3">
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
      </div>
    </motion.div>
  );
}
