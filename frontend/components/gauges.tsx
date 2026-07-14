"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Tone = "good" | "warn" | "bad" | "info" | "accent";

const toneVar: Record<Tone, string> = {
  good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)",
  info: "var(--info)", accent: "var(--accent)",
};

/**
 * Bespoke SVG radial gauge (270° sweep), theme-aware via semantic tokens. Used for
 * the confidence gauge and the market-position gauge. Matches the hand-rolled ring in
 * damage-report.tsx so the signature visuals stay on-brand (see ROADMAP §6).
 */
export function RadialGauge({
  value, min = 0, max = 100, tone = "accent", label, sublabel, size = 132, format,
}: {
  value: number; min?: number; max?: number; tone?: Tone;
  label?: string; sublabel?: string; size?: number; format?: (v: number) => string;
}) {
  const clamped = Math.max(min, Math.min(max, value));
  const frac = (clamped - min) / Math.max(1e-9, max - min);
  const sweep = 270; // degrees
  const start = 135; // start angle (bottom-left), going clockwise
  const r = 52;
  const cx = 60, cy = 60;
  const circ = 2 * Math.PI * r;
  const arcLen = (sweep / 360) * circ;
  const dash = `${arcLen} ${circ}`;
  const offset = arcLen * (1 - frac);

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} style={{ transform: `rotate(${start}deg)` }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--surface-2))" strokeWidth="9"
          strokeLinecap="round" strokeDasharray={dash} />
        <motion.circle
          cx={cx} cy={cy} r={r} fill="none" stroke={`hsl(${toneVar[tone]})`} strokeWidth="9"
          strokeLinecap="round" strokeDasharray={dash}
          initial={{ strokeDashoffset: arcLen }} animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute text-center">
        <div className={cn("tnum text-2xl font-semibold")} style={{ color: `hsl(${toneVar[tone]})` }}>
          {format ? format(clamped) : Math.round(clamped)}
        </div>
        {label && <div className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</div>}
        {sublabel && <div className="text-[10px] text-muted">{sublabel}</div>}
      </div>
    </div>
  );
}
