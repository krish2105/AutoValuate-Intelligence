"use client";
import { useMemo } from "react";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  ReferenceArea, ReferenceLine, Cell, BarChart, Bar, Tooltip,
} from "recharts";
import { BarChart3 } from "lucide-react";
import type { ValuationResult } from "@/lib/types";
import { aed, km, titleCase } from "@/lib/utils";
import { SectionCard, Pill } from "./ui";
import { RadialGauge } from "./gauges";

/** Theme-aware colors — CSS vars resolve to the active light/dark palette at render. */
const C = {
  grid: "hsl(var(--border))",
  axis: "hsl(var(--muted))",
  accent: "hsl(var(--accent))",
  info: "hsl(var(--info))",
  good: "hsl(var(--good))",
  fg: "hsl(var(--fg))",
};

const shortAed = (n: number) => "AED " + (n >= 1000 ? `${Math.round(n / 1000)}k` : Math.round(n).toString());
const shortKm = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`);

function ChartTip({ rows }: { rows: [string, string][] }) {
  return (
    <div className="rounded-xl border bg-surface px-3 py-2 text-xs shadow-lift">
      {rows.map(([k, v], i) => (
        <div key={i} className={i === 0 ? "font-semibold text-fg" : "text-muted"}>
          {i === 0 ? v : (<><span>{k}: </span><span className="tnum text-fg">{v}</span></>)}
        </div>
      ))}
    </div>
  );
}

export function MarketAnalytics({ result }: { result: ValuationResult }) {
  const { comparables, valuation, vehicle } = result;
  const mid = valuation.price_mid_aed;

  const scatter = useMemo(
    () => comparables.filter((c) => c.kilometers > 0 && c.price_aed > 0)
      .map((c) => ({ km: c.kilometers, price: c.price_aed, label: `${c.year} ${c.make} ${c.model}`, id: c.listing_id })),
    [comparables],
  );
  const you = { km: vehicle.kilometers || 0, price: mid };

  // market position: share of comparables priced below the estimate
  const prices = comparables.map((c) => c.price_aed).filter((p) => p > 0).sort((a, b) => a - b);
  const below = prices.filter((p) => p < mid).length;
  const percentile = prices.length ? Math.round((below / prices.length) * 100) : 50;

  const bars = useMemo(() => {
    const rows = comparables.filter((c) => c.price_aed > 0)
      .map((c) => ({ name: `${c.year} ${c.model}`.slice(0, 16), price: c.price_aed, you: false }));
    rows.push({ name: "Your car (est.)", price: mid, you: true });
    return rows.sort((a, b) => a.price - b.price);
  }, [comparables, mid]);

  // Too few comparables to chart anything honest — a scatter or a market-position gauge built on
  // one listing is noise dressed as a signal. Rather than vanish (which made the feature look
  // absent), say why: the corpus is thin for this model. Same data-scarcity limit the /model
  // page and the accuracy plan already own — surfaced here instead of hidden.
  if (scatter.length < 2 && comparables.length < 2) {
    return (
      <SectionCard
        title="Market analytics"
        subtitle="Price-vs-mileage, market position"
        icon={<BarChart3 className="h-4.5 w-4.5" />}
        right={<Pill tone="muted">{comparables.length === 0 ? "no comparables" : "1 comparable"}</Pill>}
      >
        <div className="rounded-xl border border-dashed bg-surface-2/30 p-4">
          <p className="text-sm text-fg/85">
            Not enough comparable listings for{" "}
            <span className="font-medium">{vehicle.year} {titleCase(vehicle.make)} {titleCase(vehicle.model)}</span>{" "}
            to chart the market yet.
          </p>
          <p className="mt-1.5 text-xs text-muted">
            The charts need at least two similar cars in the corpus, and this make/model is
            currently sparse. The valuation above still stands — it leans on the model rather than
            on comparables — but the price-vs-mileage scatter and market-position gauge only appear
            once the corpus has more of this car. Growing the corpus is the fix, not a code change.
          </p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Market analytics"
      subtitle="Where your car sits against live comparable listings"
      icon={<BarChart3 className="h-4.5 w-4.5" />}
      right={<Pill tone={percentile <= 50 ? "good" : "info"}>{percentile <= 50 ? `cheaper than ${100 - percentile}%` : `pricier than ${percentile}%`}</Pill>}
    >
      {/* headline market-position stat + gauge */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p className="text-xs text-muted">Your estimate</p>
            <p className="tnum text-2xl font-semibold text-accent">{aed(mid)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Comparable range</p>
            <p className="tnum text-sm font-medium">{aed(prices[0] ?? valuation.price_low_aed)} – {aed(prices[prices.length - 1] ?? valuation.price_high_aed)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Market position</p>
            <p className="tnum text-sm font-medium">{percentile}<span className="text-muted">th percentile · {prices.length} listings</span></p>
          </div>
        </div>
        <RadialGauge value={percentile} tone={percentile <= 50 ? "good" : "info"} size={112}
          label="percentile" sublabel={percentile <= 50 ? "priced low" : "priced high"} format={(v) => `${Math.round(v)}`} />
      </div>

      {/* Price vs mileage */}
      <p className="mb-1 text-xs font-medium text-muted">Price vs mileage — your car in <span className="text-accent">amber</span></p>
      <p className="sr-only">Scatter chart: price versus mileage for {scatter.length} comparable listings, with your car's estimate of {aed(mid)} plotted against {km(you.km)}.</p>
      <div className="h-56 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
            <ReferenceArea y1={valuation.price_low_aed} y2={valuation.price_high_aed} fill={C.accent} fillOpacity={0.07} />
            <ReferenceLine y={mid} stroke={C.accent} strokeDasharray="4 4" strokeOpacity={0.5} />
            <XAxis type="number" dataKey="km" name="Mileage" tickFormatter={shortKm} unit="km"
              tick={{ fill: C.axis, fontSize: 11 }} stroke={C.grid} />
            <YAxis type="number" dataKey="price" name="Price" tickFormatter={shortAed}
              tick={{ fill: C.axis, fontSize: 11 }} stroke={C.grid} width={54} />
            <ZAxis range={[60, 60]} />
            <Tooltip cursor={{ stroke: C.grid }} content={({ payload }) => {
              const p = payload?.[0]?.payload; if (!p) return null;
              return <ChartTip rows={[["", p.you ? "Your car (estimate)" : p.label], ["Mileage", km(p.km)], ["Price", aed(p.price)]]} />;
            }} />
            <Scatter name="Comparables" data={scatter} fill={C.info} fillOpacity={0.75} />
            <Scatter name="Your car" data={[you]} fill={C.accent}>
              <Cell r={9} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Estimate vs comparables */}
      <p className="mb-1 mt-6 text-xs font-medium text-muted">Your estimate vs each comparable</p>
      <p className="sr-only">Bar chart comparing your estimate of {aed(mid)} against each comparable listing's price.</p>
      <div className="h-56 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickFormatter={shortAed} tick={{ fill: C.axis, fontSize: 11 }} stroke={C.grid} />
            <YAxis type="category" dataKey="name" tick={{ fill: C.axis, fontSize: 10 }} width={92} stroke={C.grid} />
            <Tooltip cursor={{ fill: C.grid, fillOpacity: 0.15 }} content={({ payload }) => {
              const p = payload?.[0]?.payload; if (!p) return null;
              return <ChartTip rows={[["", p.you ? "Your car (estimate)" : p.name], ["Price", aed(p.price)]]} />;
            }} />
            <Bar dataKey="price" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {bars.map((b, i) => <Cell key={i} fill={b.you ? C.accent : C.info} fillOpacity={b.you ? 1 : 0.55} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}
