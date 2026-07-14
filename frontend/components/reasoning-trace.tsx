"use client";
import { motion, AnimatePresence } from "framer-motion";
import { Check, AlertTriangle, X, ShieldCheck, ScanSearch, Calculator, Search, FileText, Sparkles, ClipboardCheck } from "lucide-react";
import type { TraceStep } from "@/lib/types";
import { cn } from "@/lib/utils";

const META: Record<string, { label: string; icon: React.ReactNode }> = {
  intake: { label: "Intake & validation", icon: <ClipboardCheck className="h-4 w-4" /> },
  aggregation: { label: "Damage aggregation (CV)", icon: <ScanSearch className="h-4 w-4" /> },
  valuation: { label: "Price model + SHAP", icon: <Calculator className="h-4 w-4" /> },
  comparables: { label: "Comparable listings (RAG)", icon: <Search className="h-4 w-4" /> },
  report: { label: "Report synthesis", icon: <FileText className="h-4 w-4" /> },
  verifier: { label: "Citation verifier", icon: <ShieldCheck className="h-4 w-4" /> },
  confidence: { label: "Confidence disclosure", icon: <Sparkles className="h-4 w-4" /> },
};
const ORDER = Object.keys(META);

export function ReasoningTrace({ steps, active }: { steps: TraceStep[]; active: boolean }) {
  const doneSet = new Map(steps.map((s) => [s.step, s]));
  const nextIdx = steps.length;

  return (
    <ol className="space-y-1.5">
      {ORDER.map((key, i) => {
        const step = doneSet.get(key);
        const isDone = !!step;
        const isCurrent = active && i === nextIdx;
        const tone = step?.status;
        return (
          <li key={key} className={cn(
            "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
            isDone ? "bg-surface-2/50" : isCurrent ? "border-accent/40 bg-accent/6" : "opacity-45"
          )}>
            <div className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface">
              {isCurrent && !isDone && <span className="absolute inset-0 animate-pulse-ring rounded-lg bg-accent/40" />}
              <span className={cn(isDone ? (tone === "flagged" ? "text-warn" : tone === "error" ? "text-bad" : "text-good") : isCurrent ? "text-accent" : "text-muted")}>
                {META[key].icon}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{META[key].label}</p>
                {isDone && tone === "ok" && <Check className="h-3.5 w-3.5 shrink-0 text-good" />}
                {isDone && tone === "flagged" && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warn" />}
                {isDone && tone === "error" && <X className="h-3.5 w-3.5 shrink-0 text-bad" />}
              </div>
              <AnimatePresence mode="wait">
                {isDone ? (
                  <motion.p key="d" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="truncate text-xs text-muted">
                    {step!.detail}
                  </motion.p>
                ) : isCurrent ? (
                  <motion.p key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-accent">working…</motion.p>
                ) : null}
              </AnimatePresence>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
