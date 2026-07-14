"use client";
/**
 * Bespoke line-art GT silhouette that draws itself on load — the hero's signature
 * "unveil" moment (the free-tier answer to a marque site's cinematography). Pure SVG
 * strokes animated via pathLength; theme-aware through semantic tokens.
 */
import { motion, useReducedMotion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

export function HeroCar({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const draw = (delay: number, dur = 1.6) =>
    reduced
      ? {}
      : {
          initial: { pathLength: 0, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          transition: { pathLength: { duration: dur, ease: EASE, delay }, opacity: { duration: 0.01, delay } },
        };

  return (
    <svg viewBox="0 0 900 300" fill="none" className={className} role="img"
      aria-label="Line drawing of a grand-touring car">
      <defs>
        <linearGradient id="bodyStroke" x1="0" y1="0" x2="900" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="hsl(var(--muted))" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="hsl(var(--accent))" />
          <stop offset="1" stopColor="hsl(var(--accent))" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id="floorGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="hsl(var(--accent))" stopOpacity="0.28" />
          <stop offset="1" stopColor="hsl(var(--accent))" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* floor glow — the showroom light pool */}
      <motion.ellipse
        cx="460" cy="268" rx="380" ry="26" fill="url(#floorGlow)"
        initial={reduced ? undefined : { opacity: 0 }}
        animate={reduced ? undefined : { opacity: 1 }}
        transition={{ duration: 1.2, delay: 1.4 }}
      />

      {/* ground line */}
      <motion.line x1="36" y1="262" x2="872" y2="262" stroke="hsl(var(--border))" strokeWidth="1.5" {...draw(0, 1.2)} />

      {/* body silhouette */}
      <motion.path
        d="M 90 238
           C 62 234 48 220 50 200
           C 52 178 64 166 92 156
           C 140 140 175 132 245 126
           C 305 96 345 84 425 82
           C 505 80 565 92 615 122
           C 685 140 745 152 800 168
           C 840 178 858 190 860 206
           C 861 220 850 228 830 232
           L 752 236
           A 50 50 0 0 1 652 236
           L 302 236
           A 50 50 0 0 1 202 236
           L 130 238
           L 90 238 Z"
        stroke="url(#bodyStroke)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        {...draw(0.15, 2.2)}
      />

      {/* glasshouse */}
      <motion.path
        d="M 382 128 C 420 104 472 98 540 108 C 570 118 592 130 608 142"
        stroke="hsl(var(--muted))" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round"
        {...draw(1.0, 1.2)}
      />
      {/* character line */}
      <motion.path
        d="M 122 192 C 300 176 560 176 798 198"
        stroke="hsl(var(--muted))" strokeOpacity="0.45" strokeWidth="1.5" strokeLinecap="round"
        {...draw(1.25, 1.2)}
      />
      {/* headlight slash + tail light */}
      <motion.path d="M 852 196 C 838 190 822 186 806 184" stroke="hsl(var(--accent))" strokeWidth="2.5" strokeLinecap="round" {...draw(1.7, 0.6)} />
      <motion.path d="M 60 176 C 72 170 84 166 98 164" stroke="hsl(var(--bad))" strokeOpacity="0.8" strokeWidth="2.5" strokeLinecap="round" {...draw(1.8, 0.6)} />

      {/* wheels — outer rim, barrel, hub */}
      {[{ cx: 702 }, { cx: 252 }].map(({ cx }, i) => (
        <g key={cx}>
          <motion.circle cx={cx} cy="232" r="40" stroke="hsl(var(--fg))" strokeOpacity="0.8" strokeWidth="2.5" {...draw(0.9 + i * 0.2, 1.1)} />
          <motion.circle cx={cx} cy="232" r="24" stroke="hsl(var(--muted))" strokeOpacity="0.6" strokeWidth="1.5" {...draw(1.2 + i * 0.2, 0.9)} />
          <motion.circle cx={cx} cy="232" r="4" fill="hsl(var(--accent))" initial={reduced ? undefined : { scale: 0, opacity: 0 }} animate={reduced ? undefined : { scale: 1, opacity: 1 }} transition={{ delay: 1.6 + i * 0.2, duration: 0.4, ease: EASE }} />
        </g>
      ))}

      {/* scan frame — a nod to the on-device damage detector */}
      <motion.path
        d="M 330 60 L 300 60 L 300 84 M 570 60 L 600 60 L 600 84"
        stroke="hsl(var(--info))" strokeOpacity="0.75" strokeWidth="1.5" strokeLinecap="round"
        {...draw(2.0, 0.7)}
      />
      <motion.text
        x="450" y="52" textAnchor="middle" fill="hsl(var(--info))" fillOpacity="0.8"
        fontSize="11" letterSpacing="4" fontFamily="var(--font-mono)"
        initial={reduced ? undefined : { opacity: 0 }} animate={reduced ? undefined : { opacity: 1 }} transition={{ delay: 2.3, duration: 0.6 }}
      >
        DAMAGE-AWARE
      </motion.text>
    </svg>
  );
}
