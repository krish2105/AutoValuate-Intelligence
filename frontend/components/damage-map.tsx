"use client";
import { useMemo } from "react";
import { Compass } from "lucide-react";
import type { ValuationResult, DamageFinding } from "@/lib/types";
import { ANGLES } from "./guided-capture";
import { SectionCard, Pill } from "./ui";

/**
 * WS E2 — damage map.
 *
 * Plots each scan finding on a top-view car dial at the walk-around angle whose photo
 * caught it. This is deliberately a map of CAMERA POSITIONS, not car panels: the detector
 * knows which photo damage appeared in, and with guided capture each photo has a known
 * shooting position — that much is honest. It does NOT know which body panel was hit,
 * so this card never claims one. Quick uploads carry no position at all → card absent.
 */

interface Zone {
  id: string;
  label: string;
  deg: number;
  findings: DamageFinding[];
}

const FMT: Record<string, string> = {
  dent: "dent", scratch: "scratch", crack: "crack", glass_shatter: "shattered glass",
  lamp_broken: "broken lamp", tire_flat: "flat tire", punctured: "puncture",
  missing_part: "missing part",
};
const fmt = (t: string) => FMT[t] ?? t.replace(/_/g, " ");

/** One 45°-wide donut segment centered on `deg` (0 = front = top of the dial). */
function wedgePath(deg: number, r0: number, r1: number, cx = 100, cy = 100): string {
  const a0 = ((deg - 112.5) * Math.PI) / 180; // -90 (front at top) − 22.5 (half a segment)
  const a1 = ((deg - 67.5) * Math.PI) / 180;
  const p = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  return `M ${p(r0, a0)} A ${r0} ${r0} 0 0 1 ${p(r0, a1)} L ${p(r1, a1)} A ${r1} ${r1} 0 0 0 ${p(r1, a0)} Z`;
}

export function DamageMap({ result }: { result: ValuationResult }) {
  const findings = result.condition?.findings ?? [];

  const zones: Zone[] = useMemo(
    () => ANGLES.map((a) => ({
      id: a.id, label: a.label, deg: a.deg,
      findings: findings.filter((f) => f.angles_with_damage?.includes(a.id)),
    })),
    [findings],
  );

  const hit = zones.filter((z) => z.findings.length > 0);
  // No guided-capture scan → no position data → nothing honest to draw.
  if (hit.length === 0) return null;

  const maxCount = Math.max(...zones.map((z) => z.findings.length));
  const worst = hit.reduce((a, b) => (b.findings.length > a.findings.length ? b : a));

  return (
    <SectionCard
      title="Damage map"
      subtitle="Which walk-around angle each finding was photographed from"
      icon={<Compass className="h-4.5 w-4.5" />}
      right={<Pill tone="warn">{worst.label.toLowerCase()} worst</Pill>}
    >
      <p className="sr-only">
        Damage by capture angle: {hit.map((z) => `${z.label}: ${z.findings.map((f) => fmt(f.damage_type)).join(", ")}`).join("; ")}.
      </p>

      <div className="flex flex-wrap items-center gap-6">
        {/* the dial */}
        <svg viewBox="0 0 200 200" className="mx-auto h-52 w-52 shrink-0" aria-hidden>
          {/* car, seen from above, nose up */}
          <rect x="78" y="54" width="44" height="92" rx="15"
            fill="hsl(var(--muted))" fillOpacity="0.14"
            stroke="hsl(var(--muted))" strokeOpacity="0.5" strokeWidth="1.5" />
          <line x1="78" y1="82" x2="122" y2="82" stroke="hsl(var(--muted))" strokeOpacity="0.5" strokeWidth="1.2" />
          <line x1="78" y1="122" x2="122" y2="122" stroke="hsl(var(--muted))" strokeOpacity="0.5" strokeWidth="1.2" />
          <text x="100" y="44" textAnchor="middle" fontSize="9" fill="hsl(var(--muted))">FRONT</text>

          {zones.map((z) => {
            const n = z.findings.length;
            return (
              <path key={z.id} d={wedgePath(z.deg, 62, 88)}
                fill={n > 0 ? "hsl(var(--bad))" : "hsl(var(--muted))"}
                fillOpacity={n > 0 ? 0.18 + 0.55 * (n / maxCount) : 0.06}
                stroke="hsl(var(--border))" strokeWidth="1">
                <title>{`${z.label}: ${n ? z.findings.map((f) => fmt(f.damage_type)).join(", ") : "clear"}`}</title>
              </path>
            );
          })}
          {zones.map((z) => {
            const n = z.findings.length;
            if (!n) return null;
            const rad = ((z.deg - 90) * Math.PI) / 180;
            return (
              <text key={z.id} x={100 + 75 * Math.cos(rad)} y={100 + 75 * Math.sin(rad) + 3.5}
                textAnchor="middle" fontSize="11" fontWeight="600" fill="hsl(var(--bad))">
                {n}
              </text>
            );
          })}
        </svg>

        {/* the itemization */}
        <ul className="min-w-0 flex-1 space-y-2" aria-hidden>
          {hit.map((z) => (
            <li key={z.id} className="flex items-baseline gap-2 text-sm">
              <span className="w-24 shrink-0 font-medium">{z.label}</span>
              <span className="min-w-0 text-muted">
                {z.findings.map((f, i) => (
                  <span key={f.damage_type}>
                    {i > 0 && ", "}
                    {fmt(f.damage_type)}
                    {f.severity ? <span className="text-[11px]"> ({f.severity})</span> : null}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-3 text-[11px] text-muted">
        Positions are the camera angles from the guided walk-around — where damage was{" "}
        <em>photographed</em>, not a claim about the exact panel. A finding seen from two
        angles is marked on both.
      </p>
    </SectionCard>
  );
}
