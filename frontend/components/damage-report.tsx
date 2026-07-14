"use client";
import { motion } from "framer-motion";
import { ScanSearch, ShieldOff } from "lucide-react";
import type { Condition } from "@/lib/types";
import { SectionCard, Pill } from "./ui";
import { titleCase } from "@/lib/utils";

function scoreTone(s: number): "good" | "warn" | "bad" {
  return s >= 80 ? "good" : s >= 55 ? "warn" : "bad";
}

export function DamageReport({ c }: { c: Condition }) {
  if (!c.cv_available) {
    return (
      <SectionCard title="Visual damage assessment" subtitle="Computer-vision panel" icon={<ScanSearch className="h-4.5 w-4.5" />}
        right={<Pill tone="muted">not run</Pill>}>
        <div className="flex items-start gap-3 rounded-xl border bg-surface-2/40 p-4">
          <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
          <p className="text-sm text-muted">
            No photo-based damage scan was performed for this valuation, so the estimate assumes market-typical condition.
            The trained YOLOv8 detector runs on the Hugging Face Space; add photos with the service live to get a condition score.
          </p>
        </div>
      </SectionCard>
    );
  }
  const score = c.condition_score ?? 0;
  const tone = scoreTone(score);
  const ring = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : "text-bad";

  return (
    <SectionCard title="Visual damage assessment" subtitle={`${c.photos_assessed} photo(s) scanned`} icon={<ScanSearch className="h-4.5 w-4.5" />}
      right={<Pill tone={tone}>−{c.total_value_impact_pct}% value</Pill>}>
      <div className="flex items-center gap-5">
        <div className="relative grid h-24 w-24 shrink-0 place-items-center">
          <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--surface-2))" strokeWidth="8" />
            <motion.circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className={ring} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={264} initial={{ strokeDashoffset: 264 }} animate={{ strokeDashoffset: 264 - (264 * score) / 100 }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} />
          </svg>
          <div className="absolute text-center">
            <div className={`tnum text-2xl font-semibold ${ring}`}>{score}</div>
            <div className="text-[10px] text-muted">/ 100</div>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {c.findings.map((f, i) => (
            <motion.div key={f.damage_type} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 * i }}
              className="flex items-center justify-between gap-2 rounded-lg bg-surface-2/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{titleCase(f.damage_type.replace("_", " "))}</span>
                <span className="text-xs text-muted">×{f.instances}</span>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone="info">{Math.round(f.max_confidence * 100)}% conf</Pill>
                <span className="tnum text-xs text-bad">−{f.value_impact_pct}%</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}
