"use client";
import { useEffect, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceDot,
} from "recharts";
import { TrendingDown } from "lucide-react";
import type { ValuationResult } from "@/lib/types";
import { fetchDepreciation, type DepreciationData } from "@/lib/api";
import { aed, km } from "@/lib/utils";
import { SectionCard, Pill } from "./ui";

const C = {
  grid: "hsl(var(--border))",
  axis: "hsl(var(--muted))",
  accent: "hsl(var(--accent))",
  info: "hsl(var(--info))",
  bg: "hsl(var(--bg))",
};

const shortAed = (n: number) => "AED " + (n >= 1000 ? `${Math.round(n / 1000)}k` : Math.round(n).toString());
const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * WS E3 — depreciation curve from the live corpus.
 *
 * Unlike the Forecast card (which asks the pricing model to age THIS car forward), this
 * plots what the market actually asks: every corpus listing of the same model — or the
 * whole make when the model is thin, and the copy says which — as price vs age, with a
 * median-by-age line and the user's car placed at its estimated value. These are asking
 * prices of live listings, not sale prices; the caption owns that instead of hiding it.
 */
export function Depreciation({ result }: { result: ValuationResult }) {
  const [data, setData] = useState<DepreciationData | null>(null);

  const v = result.vehicle;
  const mid = result.valuation.price_mid_aed;

  useEffect(() => {
    let cancelled = false;
    fetchDepreciation(v.make ?? "", v.model ?? "").then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, [v.make, v.model]);

  // Below this the "curve" is a handful of anecdotes — quietly render nothing.
  if (!data || data.points.length < 6) return null;

  const userAge = Math.max(0, data.reference_year - (v.year ?? data.reference_year));
  const maxAge = Math.max(userAge, ...data.points.map((p) => p.age));
  const scopeLabel = data.scope === "model"
    ? `${cap(data.make)} ${cap(data.model)}`
    : `${cap(data.make)} (all models)`;
  // The backend caps the plotted points (DEPRECIATION_MAX_POINTS); when the pool is larger
  // than that, the dots are an evenly-thinned sample. The median line is still over the full
  // pool, so say "sampled" honestly rather than implying every listing is drawn.
  const shown = data.points.length;
  const thinned = data.n > shown;

  return (
    <SectionCard
      title="Depreciation curve"
      subtitle={`What the market asks for a ${scopeLabel} at every age`}
      icon={<TrendingDown className="h-4.5 w-4.5" />}
      right={<Pill tone="info">{data.n} live listings</Pill>}
    >
      <p className="mb-1 text-xs font-medium text-muted">
        Price vs age — {thinned ? `each dot is one of ${shown} sampled listings` : "each dot is a live listing"},
        the line is the median over all {data.n}, your car in{" "}
        <span className="text-accent">amber</span>
      </p>
      <p className="sr-only">
        Scatter chart of {thinned ? `${shown} listings sampled from ${data.n}` : `${data.n}`} live {scopeLabel} listings
        by price and age, with a median-by-age line over the full set. Your {userAge}-year-old car is
        plotted at its estimated value of {aed(mid)}.
      </p>
      <div className="h-60 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 10, right: 14, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
            <XAxis type="number" dataKey="age" domain={[0, maxAge + 1]} allowDecimals={false}
              unit="y" tick={{ fill: C.axis, fontSize: 11 }} stroke={C.grid} />
            <YAxis type="number" dataKey="price" tickFormatter={shortAed}
              tick={{ fill: C.axis, fontSize: 11 }} stroke={C.grid} width={54} />
            <Tooltip cursor={{ stroke: C.grid }} content={({ payload }) => {
              const p = payload?.[0]?.payload;
              if (!p) return null;
              const isListing = typeof p.km === "number";
              return (
                <div className="rounded-xl border bg-surface px-3 py-2 text-xs shadow-lift">
                  <p className="font-semibold text-fg">
                    {isListing ? `${p.year} listing` : `Median at ${p.age}y (${p.n} listings)`}
                  </p>
                  {isListing && p.km > 0 && <p className="text-muted">Mileage: <span className="tnum text-fg">{km(p.km)}</span></p>}
                  <p className="text-muted">Price: <span className="tnum text-fg">{aed(p.price)}</span></p>
                </div>
              );
            }} />
            <Scatter data={data.points} fill={C.info} fillOpacity={0.5} shape="circle" />
            {data.median.length >= 3 && (
              <Line data={data.median} type="monotone" dataKey="price" stroke={C.accent}
                strokeWidth={2.5} dot={{ r: 3, fill: C.accent }} activeDot={{ r: 5 }} />
            )}
            <ReferenceDot x={userAge} y={mid} r={7} fill={C.accent} stroke={C.bg} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-[11px] text-muted">
        {data.scope === "make" && (
          <>Too few {cap(data.model)} listings for a model-level curve, so this shows every{" "}
          {cap(data.make)} in the corpus. </>
        )}
        These are asking prices of live UAE listings, not sale prices — sellers typically settle
        below them. Your car sits at the model&apos;s mid estimate; ages with a single listing
        don&apos;t get a median point.
      </p>
    </SectionCard>
  );
}
