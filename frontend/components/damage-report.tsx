"use client";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from "recharts";
import { ScanSearch, ShieldOff, Cpu, Wrench, RotateCcw } from "lucide-react";
import type { Condition, Valuation } from "@/lib/types";
import { SectionCard, Pill } from "./ui";
import { aed, cn, titleCase } from "@/lib/utils";

const CV_CLASSES = ["dent", "scratch", "crack", "glass_shatter", "lamp_broken", "tire_flat", "punctured", "missing_part"];
const MAX_TOTAL_DEDUCTION = 0.35; // mirror aggregation_agent

function scoreTone(s: number): "good" | "warn" | "bad" {
  return s >= 80 ? "good" : s >= 55 ? "warn" : "bad";
}

export function DamageReport({ c, valuation }: { c: Condition; valuation?: Valuation }) {
  if (!c.cv_available) {
    return (
      <SectionCard title="Visual damage assessment" subtitle="Computer-vision panel" icon={<ScanSearch className="h-4.5 w-4.5" />}
        right={<Pill tone="muted">not run</Pill>}>
        <div className="flex items-start gap-3 rounded-xl border bg-surface-2/40 p-4">
          <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
          <p className="text-sm text-muted">
            No photo-based damage scan was performed for this valuation, so the estimate assumes market-typical condition.
            Add photos above and the on-device detector runs a visual damage assessment in your browser.
          </p>
        </div>
      </SectionCard>
    );
  }
  return <DamageReportBody c={c} valuation={valuation} />;
}

function DamageReportBody({ c, valuation }: { c: Condition; valuation?: Valuation }) {
  // "repaired" = findings the user toggled off in the what-if
  const [repaired, setRepaired] = useState<Set<string>>(new Set());

  // Baseline (pre-condition) mid so we can price each finding in AED.
  const baselineMid = useMemo(() => {
    if (!valuation) return null;
    const f = valuation.condition_adjusted ? valuation.condition_factor || 1 : 1;
    return valuation.price_mid_aed / f;
  }, [valuation]);

  // Live recompute of the deduction/score over the still-present (not repaired) findings.
  const live = useMemo(() => {
    const active = c.findings.filter((f) => !repaired.has(f.damage_type));
    const deduction = Math.min(active.reduce((s, f) => s + f.value_impact_pct / 100, 0), MAX_TOTAL_DEDUCTION);
    const score = Math.round(100 * (1 - deduction));
    const factor = 1 - deduction;
    return { deduction, score, factor };
  }, [c.findings, repaired]);

  const adjustedMid = baselineMid != null ? Math.round(baselineMid * live.factor) : null;
  const recovered = baselineMid != null ? Math.round(baselineMid * live.factor) - (valuation?.price_mid_aed ?? 0) : 0;
  const aedFor = (pct: number) => (baselineMid != null ? Math.round(baselineMid * (pct / 100)) : null);

  const tone = scoreTone(live.score);
  const ring = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : "text-bad";
  const anyRepaired = repaired.size > 0;
  // Show the band only against the as-scanned score — the repair what-if changes the point
  // estimate, and pretending the band tracks it would be inventing numbers.
  const band = !anyRepaired && c.score_band && c.score_band[0] !== c.score_band[1] ? c.score_band : null;
  const anyUncertain = c.findings.some((f) => f.uncertain);

  const toggle = (t: string) =>
    setRepaired((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });

  return (
    <SectionCard title="Visual damage assessment"
      subtitle={`${c.photos_assessed} photo(s) scanned${c.source === "browser" ? " · on-device" : ""} · tap a finding to price a repair`}
      icon={<ScanSearch className="h-4.5 w-4.5" />}
      right={
        <div className="flex items-center gap-1.5">
          {c.source === "browser" && <Pill tone="info"><Cpu className="h-3 w-3" /> on-device</Pill>}
          <Pill tone={tone}>−{Math.round(live.deduction * 100 * 10) / 10}% value</Pill>
        </div>
      }>
      <div className="flex items-center gap-5">
        <div className="relative grid h-24 w-24 shrink-0 place-items-center">
          <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--surface-2))" strokeWidth="8" />
            <motion.circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className={ring} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={264} animate={{ strokeDashoffset: 264 - (264 * live.score) / 100 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
          </svg>
          <div className="absolute text-center">
            <motion.div key={live.score} initial={{ scale: 0.85, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} className={`tnum text-2xl font-semibold ${ring}`}>{live.score}</motion.div>
            <div className="text-[10px] text-muted">/ 100</div>
            {/* the honest range: detector error means the point score is an estimate */}
            {band && (
              <div className="tnum text-[9px] font-medium text-muted">{band[0]}–{band[1]}</div>
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {c.findings.map((f, i) => {
            const isRepaired = repaired.has(f.damage_type);
            const cost = aedFor(f.value_impact_pct);
            return (
              <motion.button
                type="button" key={f.damage_type}
                onClick={() => toggle(f.damage_type)}
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.06 * i }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition",
                  isRepaired ? "border-good/40 bg-good/8 opacity-70" : "border-transparent bg-surface-2/50 hover:border-accent/40",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("grid h-4 w-4 place-items-center rounded-full border text-[9px]", isRepaired ? "border-good bg-good text-bg" : "border-muted/50")}>
                    {isRepaired ? "✓" : ""}
                  </span>
                  <span className={cn("text-sm font-medium", isRepaired && "line-through decoration-muted/60")}>{titleCase(f.damage_type.replace("_", " "))}</span>
                  <span className="text-xs text-muted">×{f.instances}</span>
                </div>
                <div className="flex items-center gap-2">
                  {f.uncertain
                    ? <Pill tone="warn">{Math.round(f.max_confidence * 100)}% · verify</Pill>
                    : <Pill tone="info">{Math.round(f.max_confidence * 100)}%</Pill>}
                  {cost != null
                    ? <span className={cn("tnum text-xs", isRepaired ? "text-good" : "text-bad")}>{isRepaired ? `+${aed(cost)}` : `−${aed(cost)}`}</span>
                    : <span className="tnum text-xs text-bad">−{f.value_impact_pct}%</span>}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* live price-recovery readout */}
      {baselineMid != null && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface-2/40 p-3">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Wrench className="h-3.5 w-3.5 text-accent" />
            {anyRepaired
              ? <>Repairing {repaired.size} issue{repaired.size > 1 ? "s" : ""} lifts the estimate by <span className="tnum font-semibold text-good">+{aed(recovered)}</span></>
              : <>Tap a detected issue to see what fixing it recovers.</>}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted">condition-adjusted</p>
              <p className="tnum text-sm font-semibold text-accent">{aed(adjustedMid)}</p>
            </div>
            {anyRepaired && (
              <button onClick={() => setRepaired(new Set())}
                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-muted transition hover:text-fg">
                <RotateCcw className="h-3 w-3" /> reset
              </button>
            )}
          </div>
        </div>
      )}

      {c.findings.length > 0 && <SeverityRadar c={c} />}

      {(band || anyUncertain) && (
        <p className="mt-3 text-[11px] text-muted">
          {band && (
            <>The <span className="tnum font-medium">{band[0]}–{band[1]}</span> range covers the
            detector&apos;s measured error on held-out photos: the best case treats low-confidence
            findings as false alarms, the worst case assumes damage was missed at the rate this
            model typically misses it. </>
          )}
          {anyUncertain && (
            <>Findings marked <span className="font-medium text-warn">verify</span> are below the
            confidence where the detector is usually right — check them in person rather than
            taking them as fact.</>
          )}
        </p>
      )}
    </SectionCard>
  );
}

/** Per-class condition breakdown radar (Phase L) — all 8 classes so the shape is stable. */
function SeverityRadar({ c }: { c: Condition }) {
  const impact = new Map(c.findings.map((f) => [f.damage_type, f.value_impact_pct]));
  const data = CV_CLASSES.map((cls) => ({
    cls: titleCase(cls.replace("_", " ")),
    impact: impact.get(cls) ?? 0,
  }));
  return (
    <div className="mt-4 border-t pt-4">
      <p className="mb-1 text-xs font-medium text-muted">Condition breakdown — value impact by damage type</p>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="cls" tick={{ fill: "hsl(var(--muted))", fontSize: 10 }} />
            <Radar dataKey="impact" stroke="hsl(var(--bad))" fill="hsl(var(--bad))" fillOpacity={0.35} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
