"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SlidersHorizontal, RotateCcw, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import type { ValuationResult, VehicleInput } from "@/lib/types";
import { estimateValuation } from "@/lib/api";
import { assessmentBand, SYNTHETIC_PROVENANCE } from "@/lib/cv-browser";
import { aed, cn } from "@/lib/utils";
import { SectionCard, Pill } from "./ui";
import { CountUp } from "./fx";
import { Sensitivity } from "./sensitivity";

const REF_YEAR = 2026;
// Local fallback elasticities (only used when the live model is unreachable). Anchored
// so that at the baseline slider values the number equals the model's own estimate.
const AGE_PCT_PER_YEAR = 0.09;
const KM_PCT_PER_10K = 0.012;

function baselineConditionScore(r: ValuationResult): number {
  if (typeof r.condition?.condition_score === "number") return r.condition.condition_score;
  const f = r.valuation.condition_factor;
  return f ? Math.round(f * 100) : 100;
}

function localEstimate(base: number, args: {
  km: number; kmBase: number; year: number; yearBase: number; cond: number; condBase: number;
}): number {
  const fAge = Math.pow(1 - AGE_PCT_PER_YEAR, (REF_YEAR - args.year) - (REF_YEAR - args.yearBase));
  const fKm = Math.pow(1 - KM_PCT_PER_10K, (args.km - args.kmBase) / 10_000);
  const fCond = args.cond / Math.max(1, args.condBase);
  return Math.max(0, Math.round(base * fAge * fKm * fCond));
}

function Slider({
  label, min, max, step, value, onChange, format,
}: {
  label: string; min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className="tnum text-xs font-semibold">{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        aria-label={label}
        onChange={(e) => onChange(+e.target.value)}
        className="range-accent h-2 w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        style={{ background: `linear-gradient(to right, hsl(var(--accent)) ${pct}%, hsl(var(--surface-2)) ${pct}%)` }}
      />
    </div>
  );
}

export function WhatIf({ result, online }: { result: ValuationResult; online: boolean | null }) {
  const baseMid = result.valuation.price_mid_aed;
  const baseLow = result.valuation.price_low_aed;
  const baseHigh = result.valuation.price_high_aed;
  const kmBase = Math.round(result.vehicle.kilometers || 0);
  const yearBase = result.vehicle.year || 2019;
  const condBase = baselineConditionScore(result);

  const [km, setKm] = useState(kmBase);
  const [year, setYear] = useState(yearBase);
  const [cond, setCond] = useState(condBase);
  const [mid, setMid] = useState(baseMid);
  const [range, setRange] = useState<[number, number]>([baseLow, baseHigh]);
  const [busy, setBusy] = useState(false);
  const [approx, setApprox] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // reset when a new valuation arrives
  useEffect(() => {
    setKm(kmBase); setYear(yearBase); setCond(condBase);
    setMid(baseMid); setRange([baseLow, baseHigh]); setApprox(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const atBaseline = km === kmBase && year === yearBase && cond === condBase;

  const recompute = useCallback((nextKm: number, nextYear: number, nextCond: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Optimistic local number immediately for a snappy feel; the model refines it.
    const local = localEstimate(baseMid, { km: nextKm, kmBase, year: nextYear, yearBase, cond: nextCond, condBase });
    setMid(local);

    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const factor = Math.max(0.5, Math.min(1, nextCond / 100));
      const input: VehicleInput = {
        ...result.vehicle,
        kilometers: nextKm,
        year: nextYear,
        photos: [],
        // Driven by the condition SLIDER, not by any detector — hence source "synthetic".
        // It previously claimed source "browser", i.e. a hypothetical was indistinguishable
        // from a real on-device scan of real photos.
        client_condition: nextCond >= 100 ? null : {
          ...SYNTHETIC_PROVENANCE,
          cv_available: true,
          condition_score: nextCond,
          price_adjustment_factor: Math.round(factor * 1e4) / 1e4,
          findings: [],
          photos_assessed: 0,
          total_value_impact_pct: Math.round((100 - nextCond) * 10) / 10,
          assessment: assessmentBand(nextCond),
          needs_inspection: nextCond < 70,
        },
      };

      if (online === false) { setApprox(true); return; } // offline → keep local number
      setBusy(true);
      const v = await estimateValuation(input, ctrl.signal);
      setBusy(false);
      if (ctrl.signal.aborted) return;
      if (v) {
        setApprox(false);
        setMid(v.price_mid_aed);
        setRange([v.price_low_aed, v.price_high_aed]);
      } else {
        setApprox(true); // request failed → the optimistic local number stands
      }
    }, 400);
  }, [baseMid, kmBase, yearBase, condBase, online, result.vehicle]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); abortRef.current?.abort(); }, []);

  const onKm = (v: number) => { setKm(v); recompute(v, year, cond); };
  const onYear = (v: number) => { setYear(v); recompute(km, v, cond); };
  const onCond = (v: number) => { setCond(v); recompute(km, year, v); };
  const reset = () => {
    setKm(kmBase); setYear(yearBase); setCond(condBase);
    setMid(baseMid); setRange([baseLow, baseHigh]); setApprox(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
  };

  const delta = mid - baseMid;
  const deltaPct = baseMid ? (delta / baseMid) * 100 : 0;
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const deltaTone = delta > 0 ? "good" : delta < 0 ? "bad" : "muted";

  // mini range-bar geometry
  const barMin = Math.min(baseLow, range[0]);
  const barMax = Math.max(baseHigh, range[1]);
  const span = Math.max(1, barMax - barMin);
  const pos = (v: number) => ((v - barMin) / span) * 100;

  return (
    <SectionCard
      title="What-if explorer"
      subtitle="Drag to re-price against the live model"
      icon={<SlidersHorizontal className="h-4.5 w-4.5" />}
      right={
        <div className="flex items-center gap-1.5">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
          {approx && !busy && <Pill tone="muted">approx</Pill>}
          {!atBaseline && (
            <button onClick={reset} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-muted transition hover:text-fg">
              <RotateCcw className="h-3 w-3" /> reset
            </button>
          )}
        </div>
      }
    >
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* sliders */}
        <div className="space-y-4">
          <Slider label="Mileage" min={0} max={Math.max(300_000, kmBase * 2)} step={1000} value={km} onChange={onKm}
            format={(v) => `${Math.round(v / 1000)}k km`} />
          <Slider label="Year" min={1990} max={REF_YEAR} step={1} value={year} onChange={onYear}
            format={(v) => `${v}`} />
          <Slider label="Condition" min={65} max={100} step={1} value={cond} onChange={onCond}
            format={(v) => v >= 100 ? "as described" : `${v}/100`} />
        </div>

        {/* live number */}
        <div className="flex flex-col justify-center rounded-xl border bg-surface-2/40 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted">Adjusted estimate</span>
            <span className="tnum text-2xl font-semibold text-accent">
              <span className="mr-1 text-xs font-medium text-muted">AED</span>
              <CountUp value={mid} duration={0.6} />
            </span>
          </div>

          <div className={cn("mt-1 flex items-center justify-end gap-1 text-xs font-medium",
            deltaTone === "good" ? "text-good" : deltaTone === "bad" ? "text-bad" : "text-muted")}>
            <DeltaIcon className="h-3.5 w-3.5" />
            <span className="tnum">
              {delta === 0 ? "no change vs baseline" : `${delta > 0 ? "+" : ""}${aed(delta)} (${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`}
            </span>
          </div>

          {/* range bar: baseline mid marker vs adjusted mid marker */}
          <div className="relative mt-4 h-2 rounded-full bg-surface-2">
            <div className="absolute inset-y-0 rounded-full bg-accent/25"
              style={{ left: `${pos(range[0])}%`, right: `${100 - pos(range[1])}%` }} />
            <div className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-muted" style={{ left: `${pos(baseMid)}%` }} title="baseline" />
            <div className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-accent" style={{ left: `${pos(mid)}%` }} title="adjusted" />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-muted">
            <span className="tnum">{aed(range[0])}</span>
            <span>baseline {aed(baseMid)}</span>
            <span className="tnum">{aed(range[1])}</span>
          </div>
        </div>
      </div>

      {/* E6 — the sliders above drive this curve; it renders nothing when offline. */}
      <Sensitivity vehicle={result.vehicle} year={year} condition={cond} currentKm={km} currentMid={mid} />
    </SectionCard>
  );
}
