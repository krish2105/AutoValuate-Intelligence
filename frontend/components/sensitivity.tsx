"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot,
} from "recharts";
import { estimateBatch } from "@/lib/api";
import type { VehicleInput } from "@/lib/types";
import { aed } from "@/lib/utils";

/**
 * E6 — price-vs-mileage sensitivity curve, driven by the what-if sliders.
 *
 * One `/estimate/batch` call prices the whole curve: 12 mileage variants in a single request
 * and a single rate-limit unit, rather than 12 sequential `/estimate` calls that would trip
 * the limiter and race each other. Refetches when year/condition change (the sliders), and
 * marks where the car actually sits.
 *
 * This curve is also the visible proof of the B4 monotonicity guarantee: it cannot slope up.
 * Before that fix the shipped model raised price on 100% of mileage sweeps, so drawing this
 * chart at all would have exposed the bug to anyone who looked.
 */

const C = {
  grid: "hsl(var(--border))",
  axis: "hsl(var(--muted))",
  accent: "hsl(var(--accent))",
};

const POINTS = 12;
const MAX_KM = 300_000;

export function Sensitivity({
  vehicle, year, condition, currentKm, currentMid,
}: {
  vehicle: VehicleInput;
  year: number;
  condition: number;
  currentKm: number;
  currentMid: number;
}) {
  const [curve, setCurve] = useState<{ km: number; price: number }[] | null>(null);
  const [failed, setFailed] = useState(false);
  const reqId = useRef(0);

  const grid = useMemo(
    () => Array.from({ length: POINTS }, (_, i) => Math.round((MAX_KM / (POINTS - 1)) * i)),
    [],
  );

  useEffect(() => {
    const id = ++reqId.current;
    let cancelled = false;
    (async () => {
      const rows = await estimateBatch(grid.map((km) => ({ ...vehicle, year, kilometers: km })));
      // Ignore a stale response: sliders move faster than the backend answers.
      if (cancelled || id !== reqId.current) return;
      if (!rows) return setFailed(true);
      const pts = rows
        .map((v, i) => (v ? { km: grid[i], price: Math.round(v.price_mid_aed * (condition / 100)) } : null))
        .filter((p): p is { km: number; price: number } => p !== null);
      setFailed(pts.length < 2);
      setCurve(pts.length >= 2 ? pts : null);
    })();
    return () => { cancelled = true; };
  }, [vehicle, year, condition, grid]);

  // The backend is unreachable (or too old for /estimate/batch) — say nothing rather than
  // draw a fabricated curve next to real numbers.
  if (failed || !curve) return null;

  const rises = curve.some((p, i) => i > 0 && p.price > curve[i - 1].price + 1);

  return (
    <div className="mt-5">
      <p className="mb-1 text-xs font-medium text-muted">
        Price vs mileage — everything else held at your settings
      </p>
      <p className="sr-only">
        Line chart of estimated price against mileage from 0 to {MAX_KM.toLocaleString()} km, with
        this car marked at {currentKm.toLocaleString()} km and {aed(currentMid)}. The curve never rises.
      </p>
      <div className="h-44 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={curve} margin={{ top: 6, right: 10, bottom: 0, left: -14 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="km" type="number" domain={[0, MAX_KM]} stroke={C.axis} fontSize={10}
              tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <YAxis stroke={C.axis} fontSize={10} tickLine={false} axisLine={false} width={52}
              tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))",
                borderRadius: 12, fontSize: 12, color: "hsl(var(--fg))",
              }}
              formatter={(v: number) => [aed(v), "estimate"]}
              labelFormatter={(l: number) => `${l.toLocaleString()} km`}
            />
            <Line type="monotone" dataKey="price" stroke={C.accent} strokeWidth={2.5} dot={false}
              isAnimationActive={false} />
            <ReferenceDot x={currentKm} y={currentMid} r={5} fill={C.accent} stroke="hsl(var(--bg))"
              strokeWidth={2} isFront />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {rises
          ? "⚠ This curve rises somewhere — the monotonicity guarantee is broken; please report it."
          : "This curve can never slope upward: the model is trained with a monotonic constraint, so more mileage can never mean more money."}
      </p>
    </div>
  );
}
