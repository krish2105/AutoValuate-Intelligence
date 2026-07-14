"use client";
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import type { ShapFactor } from "@/lib/types";
import { aed } from "@/lib/utils";

const PRETTY: Record<string, string> = {
  noOfCylinders: "Engine size", year: "Model year", bodyType: "Body type",
  make: "Make", model: "Model", kilometers: "Mileage", mileage_per_year: "Km / year",
  transmissionType: "Transmission", fuelType: "Fuel", regionalSpecs: "Specs",
  city: "City", sellerType: "Seller", age: "Age",
};

export function ShapWaterfall({ factors }: { factors: ShapFactor[] }) {
  const data = factors
    .slice(0, 6)
    .map((f) => ({ name: PRETTY[f.feature] ?? f.feature, value: Math.round(f.approx_aed_impact) }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 6, right: 12, top: 4, bottom: 4 }}>
          <XAxis type="number" tickFormatter={(v) => (v > 0 ? "+" : "") + (v / 1000).toFixed(0) + "k"}
            tick={{ fontSize: 11, fill: "hsl(var(--muted))" }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={78} tick={{ fontSize: 11, fill: "hsl(var(--fg))" }} axisLine={false} tickLine={false} />
          <ReferenceLine x={0} stroke="hsl(var(--border))" />
          <Tooltip
            cursor={{ fill: "hsl(var(--surface-2) / 0.5)" }}
            contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12, color: "hsl(var(--fg))" }}
            formatter={(v: number) => [(v > 0 ? "+" : "") + aed(Math.abs(v)).replace("AED ", "") + " AED", "impact"]}
          />
          <Bar dataKey="value" radius={[4, 4, 4, 4]} barSize={18} animationDuration={700}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value >= 0 ? "hsl(var(--good))" : "hsl(var(--bad))"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
