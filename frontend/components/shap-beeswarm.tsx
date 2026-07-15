"use client";
import { useMemo } from "react";
import { FEATURE_LABEL } from "@/lib/feature-labels";

/**
 * E7 — market-wide SHAP beeswarm: one dot per car per feature, across the corpus.
 *
 * Why not the bar chart we already have: mean |SHAP| collapses a feature to one number and
 * hides its direction and spread. `age` has a middling mean yet swings price from −1.09 to
 * +0.49 in log space — a young car is worth *more* for the same reason an old one is worth
 * less, and only the swarm shows that.
 *
 * Hand-rolled SVG rather than Recharts: a beeswarm is ~1k positioned dots with deterministic
 * jitter, which is a loop and two scales. Recharts would need a ScatterChart per feature row
 * plus custom shapes — more code, more bundle, less control, for the same picture.
 */

type Pt = { s: number; v: number };

export function ShapBeeswarm({
  order, features, n,
}: {
  order: string[];
  features: Record<string, Pt[]>;
  n: number;
}) {
  const ROW = 30;
  const PAD_L = 96;
  const PAD_R = 12;
  const H = order.length * ROW + 28;

  const max = useMemo(
    () => Math.max(...order.flatMap((f) => (features[f] ?? []).map((p) => Math.abs(p.s)))) || 1,
    [order, features],
  );

  // Percentage-space x so the SVG scales with its container without a resize observer.
  const x = (s: number) => PAD_L + ((s / max + 1) / 2) * (1000 - PAD_L - PAD_R);

  return (
    <div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 1000 ${H}`} className="h-auto w-full min-w-[520px]" role="img"
          aria-label={
            `SHAP beeswarm across ${n} cars. Features ranked by impact: ${order.map((f) => FEATURE_LABEL[f] ?? f).join(", ")}. ` +
            `Dots left of centre push price down, right push it up; colour is the feature's own value.`
          }>
          <defs>
            <linearGradient id="bee-legend" x1="0" x2="1">
              <stop offset="0%" stopColor="hsl(var(--info))" />
              <stop offset="100%" stopColor="hsl(var(--accent))" />
            </linearGradient>
          </defs>

          {/* zero line: no effect on price */}
          <line x1={x(0)} x2={x(0)} y1={4} y2={H - 24} stroke="hsl(var(--border))" strokeWidth={1.5} />

          {order.map((f, r) => {
            const pts = features[f] ?? [];
            const cy = r * ROW + ROW / 2;
            return (
              <g key={f}>
                <text x={PAD_L - 10} y={cy + 3.5} textAnchor="end" fontSize={11}
                  fill="hsl(var(--muted))">{FEATURE_LABEL[f] ?? f}</text>
                {pts.map((p, i) => {
                  // Deterministic jitter: index-hashed, so the swarm is stable across renders
                  // (a random one would twitch on every re-render and look like live data).
                  const j = ((Math.sin(i * 12.9898 + r * 78.233) * 43758.5453) % 1 + 1) % 1;
                  return (
                    <circle key={i} cx={x(p.s)} cy={cy + (j - 0.5) * (ROW - 12)} r={2.4}
                      fill={p.v > 0.5 ? "hsl(var(--accent))" : "hsl(var(--info))"}
                      fillOpacity={0.35 + Math.abs(p.v - 0.5) * 0.9} />
                  );
                })}
              </g>
            );
          })}

          <text x={PAD_L} y={H - 6} fontSize={10} fill="hsl(var(--muted))">← lowers price</text>
          <text x={1000 - PAD_R} y={H - 6} fontSize={10} fill="hsl(var(--muted))" textAnchor="end">raises price →</text>
        </svg>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>One dot = one of {n} real cars.</span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: "hsl(var(--info))" }} /> low feature value
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: "hsl(var(--accent))" }} /> high feature value
        </span>
      </p>
    </div>
  );
}
