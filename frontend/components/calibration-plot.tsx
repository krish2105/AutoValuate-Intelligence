"use client";
import { useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";

/**
 * E1 — reliability diagram: promise N% coverage, show what N% actually delivered.
 *
 * The one chart that can falsify our own honesty claim. A model that quietly over-promises
 * bends below the diagonal; ours is measured on held-out cars only, averaged over 20 splits
 * (single-split coverage on this corpus carries ~5pp of noise — see RESEARCH.md B5).
 */

/** Theme-aware — CSS vars resolve to the active light/dark palette at render. */
const C = {
  grid: "hsl(var(--border))",
  axis: "hsl(var(--muted))",
  accent: "hsl(var(--accent))",
  muted: "hsl(var(--muted))",
};

export type CalibrationPoint = { nominal: number; actual: number; std?: number };

export function CalibrationPlot({ curve, meanError }: { curve: CalibrationPoint[]; meanError?: number }) {
  const data = useMemo(
    () => curve.map((p) => ({
      nominal: Math.round(p.nominal * 100),
      actual: Math.round(p.actual * 1000) / 10,
      ideal: Math.round(p.nominal * 100),
      std: p.std ? Math.round(p.std * 1000) / 10 : undefined,
    })),
    [curve],
  );

  return (
    <div>
      <div className="h-[240px] w-full" role="img"
        aria-label={
          `Reliability diagram. Promised versus delivered interval coverage: ` +
          data.map((d) => `promised ${d.nominal}%, delivered ${d.actual}%`).join("; ") +
          (meanError !== undefined ? `. Mean gap ${(meanError * 100).toFixed(1)} percentage points.` : "")
        }>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="nominal" type="number" domain={[45, 100]} ticks={[50, 60, 70, 80, 90, 95]}
              tickFormatter={(v) => `${v}%`} stroke={C.axis} fontSize={11} tickLine={false} axisLine={false} />
            <YAxis type="number" domain={[45, 100]} ticks={[50, 60, 70, 80, 90, 95]}
              tickFormatter={(v) => `${v}%`} stroke={C.axis} fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))",
                borderRadius: 12, fontSize: 12, color: "hsl(var(--fg))",
              }}
              formatter={(v: number, name: string) => [`${v}%`, name === "actual" ? "delivered" : "perfect"]}
              labelFormatter={(l) => `promised ${l}%`}
            />
            {/* Perfect calibration: delivered == promised. Anything off this line is a broken promise. */}
            <Line type="monotone" dataKey="ideal" stroke={C.muted} strokeDasharray="4 4"
              strokeWidth={1.5} dot={false} isAnimationActive={false} name="perfect" />
            <Line type="monotone" dataKey="actual" stroke={C.accent} strokeWidth={2.5}
              dot={{ r: 3.5, fill: C.accent, strokeWidth: 0 }} activeDot={{ r: 5 }} name="actual" />
            <ReferenceLine x={80} stroke={C.grid} strokeDasharray="2 4" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted">
        Dashed line is a kept promise. Our 80% interval is the one the product quotes; the other
        points exist so the claim is <span className="text-fg">falsifiable at every level</span>, not
        just the flattering one.
      </p>
    </div>
  );
}
