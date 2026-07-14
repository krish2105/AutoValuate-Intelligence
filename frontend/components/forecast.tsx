"use client";
import { useEffect, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot } from "recharts";
import { CalendarClock, Loader2 } from "lucide-react";
import type { ValuationResult } from "@/lib/types";
import { estimateValuation } from "@/lib/api";
import { aed } from "@/lib/utils";
import { SectionCard, Pill } from "./ui";

const C = {
  grid: "hsl(var(--border))",
  axis: "hsl(var(--muted))",
  accent: "hsl(var(--accent))",
  info: "hsl(var(--info))",
};

const HORIZONS = [1, 2, 3]; // years ahead
const DEFAULT_ANNUAL_KM = 15_000; // UAE average when the car's own history is unusable

interface Point { label: string; year: number; value: number; }

/**
 * Phase G — sell-timing forecast.
 *
 * We do NOT invent a depreciation rate. We ask the trained pricing model what this exact
 * car is worth aged forward: age +N years and mileage +N x its own annual rate. The curve
 * is therefore the model's real view of depreciation for this vehicle, not a rule of thumb
 * — and it inherits the same error bars, which we say out loud.
 */
export function Forecast({ result }: { result: ValuationResult }) {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [busy, setBusy] = useState(false);

  const v = result.vehicle;
  const mid = result.valuation.price_mid_aed;

  useEffect(() => {
    let cancelled = false;
    async function project() {
      setBusy(true);
      const age = Math.max(1, new Date().getFullYear() - (v.year ?? 2019));
      const annualKm = Math.min(40_000, Math.max(5_000, Math.round((v.kilometers ?? 0) / age) || DEFAULT_ANNUAL_KM));

      const out: Point[] = [{ label: "Today", year: 0, value: mid }];
      for (const yrs of HORIZONS) {
        const projected = await estimateValuation({
          ...v,
          photos: [],
          year: (v.year ?? 2019) - yrs,              // one more year of age
          kilometers: (v.kilometers ?? 0) + annualKm * yrs,
        });
        if (cancelled) return;
        if (projected) out.push({ label: `+${yrs}y`, year: yrs, value: projected.price_mid_aed });
      }
      if (!cancelled) { setPoints(out.length > 1 ? out : null); setBusy(false); }
    }
    project();
    return () => { cancelled = true; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [result.valuation.price_mid_aed]);

  if (busy && !points) {
    return (
      <SectionCard title="Sell-timing forecast" subtitle="Projecting this car forward through the pricing model"
        icon={<CalendarClock className="h-4.5 w-4.5" />}>
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-accent" /> Modelling the next three years…
        </p>
      </SectionCard>
    );
  }
  if (!points || points.length < 2) return null;

  const oneYear = points.find((p) => p.year === 1)?.value ?? mid;
  const dropPerYear = mid - oneYear;
  const dropPct = mid > 0 ? Math.round((dropPerYear / mid) * 100) : 0;
  const monthlyCost = Math.round(dropPerYear / 12);

  return (
    <SectionCard
      title="Sell-timing forecast"
      subtitle="What the pricing model says this car will be worth as it ages"
      icon={<CalendarClock className="h-4.5 w-4.5" />}
      right={<Pill tone={dropPct >= 12 ? "warn" : "info"}>−{dropPct}% / year</Pill>}
    >
      <p className="sr-only">Line chart projecting this car's value over the next three years, from {aed(mid)} today.</p>
      <div className="h-52 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 14, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fill: C.axis, fontSize: 11 }} stroke={C.grid} />
            <YAxis tickFormatter={(n: number) => `${Math.round(n / 1000)}k`}
              tick={{ fill: C.axis, fontSize: 11 }} stroke={C.grid} width={44} />
            <Tooltip content={({ payload }) => {
              const p = payload?.[0]?.payload as Point | undefined;
              if (!p) return null;
              return (
                <div className="rounded-xl border bg-surface px-3 py-2 text-xs shadow-lift">
                  <p className="font-semibold text-fg">{p.label}</p>
                  <p className="tnum text-muted">{aed(p.value)}</p>
                </div>
              );
            }} />
            <Line type="monotone" dataKey="value" stroke={C.accent} strokeWidth={2.5}
              dot={{ r: 4, fill: C.accent }} activeDot={{ r: 6 }} />
            <ReferenceDot x="Today" y={mid} r={6} fill={C.info} stroke="none" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 rounded-xl border border-accent/25 bg-accent/8 px-3.5 py-3">
        <p className="text-sm leading-relaxed text-fg/90">
          Holding this car costs roughly{" "}
          <span className="tnum font-semibold text-accent">{aed(monthlyCost)}</span> a month in lost value
          (about <span className="tnum font-semibold">{aed(dropPerYear)}</span> over the next year).{" "}
          {dropPct >= 12
            ? "It's depreciating quickly — selling sooner preserves more of its value."
            : "It's holding value reasonably well, so there's less urgency to sell immediately."}
        </p>
      </div>

      <p className="mt-3 text-[11px] text-muted">
        Projected by re-running the pricing model with this car aged forward (age +N years, mileage +N × its own
        annual rate) — not a generic depreciation rate. It carries the same{" "}
        <span className="tnum">{result.valuation.model_meta.cv_median_ape_pct}%</span> median error as any other
        estimate, and it assumes the market itself stays flat.
      </p>
    </SectionCard>
  );
}
