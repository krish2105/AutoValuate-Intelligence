"use client";
/**
 * Bespoke line-art GT silhouette that draws itself on load — the hero's signature
 * "unveil" moment (the free-tier answer to a marque site's cinematography). A ~4s
 * cinematic entrance (launch → tease exit → reverse/drift, with skid marks, tire smoke
 * and an impact camera-shake) plays once, then hands off to the ambient appraisal loop:
 * a scanner sweeps the body, damage findings pop with confidence chips, and a
 * condition-adjusted price reads out — previewing the on-device detector before any
 * photo is uploaded. Pure SVG strokes via pathLength + Framer Motion keyframes on
 * x/rotate/opacity/filter (all compositor-thread); theme-aware through semantic tokens;
 * the whole stage tilts subtly toward the pointer. Fully reduced-motion aware.
 */
import { useEffect } from "react";
import { animate, motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;
/** Cubic-bezier that overshoots — fakes a spring bounce inline in keyframe arrays. */
const OVERSHOOT = [0.34, 1.56, 0.64, 1] as const;

/** One ambient appraisal pass: sweep ~0.3–2.8 s, findings hold, clear, rest. */
const CYCLE = 9;
/** First pass lands as the entrance settles (~4.0s); repeats ambiently thereafter. */
const LOOP = { duration: CYCLE, repeat: Infinity, delay: 4.1, ease: "linear" as const };

/** Entrance timeline (beats 1–3), in seconds. */
const ENTRANCE_DUR = 4.0;
/** x of the whole car group, in SVG user units (viewBox is 900 wide). */
const ENTRANCE_X = {
  values: [-780, 0, 780, 780, -24, 0],
  times: [0, 0.30, 0.50, 0.55, 0.90, 1],
  ease: [EASE, EASE, "linear", EASE, OVERSHOOT],
} as const;
/** Drift whip — active during the reverse/drift beat (t 0.50–1.0). */
const ENTRANCE_ROTATE = {
  values: [0, 0, -8, 30, -5, 0],
  times: [0, 0.50, 0.65, 0.78, 0.88, 1],
  ease: [EASE, EASE, EASE, OVERSHOOT, EASE],
} as const;
/** Impact camera-shake on the outer stage (px), fired imperatively at the reverse slam. */
const SHAKE_X = [0, -6, 5, -4, 2, 0];
const SHAKE_TIMES = [0, 0.167, 0.375, 0.583, 0.792, 1];

/** Cycle fraction at which the scanner (x 90→860 across times 0.03→0.31) crosses x. */
const hitAt = (x: number) => 0.03 + ((x - 90) / 770) * 0.28;

/** Illustrative findings, mirroring the browser-CV overlay (class, confidence, box). */
const FINDINGS = [
  { label: "lamp 0.71", tone: "--bad", box: { x: 50, y: 156, w: 52, h: 34 }, chip: { x: 40, w: 72 } },
  { label: "scratch 0.64", tone: "--info", box: { x: 430, y: 140, w: 90, h: 56 }, chip: { x: 436, w: 88 } },
  { label: "dent 0.87", tone: "--warn", box: { x: 792, y: 170, w: 56, h: 46 }, chip: { x: 780, w: 76 } },
];

export function HeroCar({ className }: { className?: string }) {
  const reduced = useReducedMotion();

  // Pointer-tracked pseudo-3D tilt — the stage leans toward the cursor.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateY = useSpring(useTransform(px, [0, 1], [-5, 5]), { stiffness: 120, damping: 18 });
  const rotateX = useSpring(useTransform(py, [0, 1], [2.5, -2.5]), { stiffness: 120, damping: 18 });

  // Impact shake: a brief x-jitter on the whole stage, timed to the reverse slam (~2.2s).
  // Kept on the outer element (composes with the tilt) so it reads as a camera hit.
  const shakeX = useMotionValue(0);
  // Launch motion-blur: driven as a style MotionValue, NOT a keyframe on the SVG <g> —
  // Framer routes `filter` on SVG elements to the (invalid) SVG filter *attribute*, so a
  // CSS filter must go through `style` instead. Blur peaks then clears over beat 1 (~1.2s).
  const launchBlur = useMotionValue(reduced ? 0 : 10);
  const launchFilter = useMotionTemplate`blur(${launchBlur}px)`;
  useEffect(() => {
    if (reduced) return;
    const shake = animate(shakeX, SHAKE_X, { duration: 0.12, delay: 2.2, ease: "linear", times: SHAKE_TIMES });
    const blur = animate(launchBlur, [10, 14, 0], { duration: 1.2, times: [0, 0.12, 1], ease: "linear" });
    return () => { shake.stop(); blur.stop(); };
  }, [reduced, shakeX, launchBlur]);

  const draw = (delay: number, dur = 1.6) =>
    reduced
      ? {}
      : {
          initial: { pathLength: 0, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          transition: { pathLength: { duration: dur, ease: EASE, delay }, opacity: { duration: 0.01, delay } },
        };

  // Looped fade for the appraisal pass; under reduced motion the findings simply rest visible.
  const appear = (t: number, o = 1) =>
    reduced
      ? { initial: { opacity: o } }
      : {
          initial: { opacity: 0 },
          animate: { opacity: [0, 0, o, o, 0, 0] },
          transition: { ...LOOP, times: [0, t, Math.min(t + 0.03, 0.68), 0.7, 0.76, 1] },
        };

  return (
    <motion.div
      className={className}
      style={reduced ? undefined : { x: shakeX, filter: launchFilter, rotateX, rotateY, transformPerspective: 900 }}
      onPointerMove={
        reduced
          ? undefined
          : (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              px.set((e.clientX - r.left) / r.width);
              py.set((e.clientY - r.top) / r.height);
            }
      }
      onPointerLeave={reduced ? undefined : () => { px.set(0.5); py.set(0.5); }}
    >
      <svg viewBox="0 0 900 300" fill="none" className="h-auto w-full" role="img"
        aria-label="Line drawing of a grand-touring car being scanned for damage">
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
          <linearGradient id="scanStroke" x1="0" y1="70" x2="0" y2="258" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="hsl(var(--accent))" stopOpacity="0" />
            <stop offset="0.5" stopColor="hsl(var(--accent))" />
            <stop offset="1" stopColor="hsl(var(--accent))" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="scanGlow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="hsl(var(--accent))" stopOpacity="0" />
            <stop offset="1" stopColor="hsl(var(--accent))" stopOpacity="0.16" />
          </linearGradient>
          {/* tire smoke puff — soft, fades to transparent */}
          <radialGradient id="smokePuff" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="hsl(var(--muted))" stopOpacity="0.5" />
            <stop offset="1" stopColor="hsl(var(--muted))" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── entrance group: the whole scene launches in, drifts, and settles ── */}
        <motion.g
          data-testid="hero-entrance"
          initial={reduced ? undefined : { x: -780, rotate: 0, opacity: 0 }}
          animate={
            reduced
              ? { opacity: 1 }
              : {
                  x: [...ENTRANCE_X.values],
                  rotate: [...ENTRANCE_ROTATE.values],
                  opacity: [0, 1, 1, 1, 1, 1],
                }
          }
          transition={
            reduced
              ? { duration: 0.01 }
              : {
                  // NOTE: per-property overrides do NOT inherit the top-level `duration`
                  // in Framer Motion — each keyframed prop needs its own, or it falls back
                  // to the ~0.3s default and the whole 4s entrance collapses instantly.
                  duration: ENTRANCE_DUR,
                  x: { duration: ENTRANCE_DUR, times: [...ENTRANCE_X.times], ease: [...ENTRANCE_X.ease] },
                  rotate: { duration: ENTRANCE_DUR, times: [...ENTRANCE_ROTATE.times], ease: [...ENTRANCE_ROTATE.ease] },
                  opacity: { duration: ENTRANCE_DUR, times: [0, 0.02, 0.30, 0.50, 0.55, 1] },
                }
          }
          style={{ transformBox: "fill-box", transformOrigin: "460px 232px" }}
        >
          {/* floor glow — the showroom light pool */}
          <motion.ellipse
            cx="460" cy="268" rx="380" ry="26" fill="url(#floorGlow)"
            initial={reduced ? undefined : { opacity: 0 }}
            animate={reduced ? undefined : { opacity: 1 }}
            transition={{ duration: 1.2, delay: 1.4 }}
          />
          {/* night-showroom underglow — dark theme only */}
          <ellipse cx="460" cy="252" rx="300" ry="9" fill="url(#floorGlow)"
            className="opacity-0 transition-opacity duration-700 dark:opacity-80" />

          {/* ground line */}
          <motion.line x1="36" y1="262" x2="872" y2="262" stroke="hsl(var(--border))" strokeWidth="1.5" {...draw(0, 1.2)} />
          {/* road ticks drifting past the parked stance */}
          <motion.line
            x1="60" y1="276" x2="850" y2="276" stroke="hsl(var(--muted))" strokeOpacity="0.35"
            strokeWidth="1.5" strokeDasharray="2 34"
            initial={{ opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, strokeDashoffset: [0, 36] }}
            transition={{
              opacity: { duration: 0.8, delay: 1.2 },
              strokeDashoffset: { duration: 1.5, repeat: Infinity, ease: "linear", delay: 3 },
            }}
          />

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

          {/* wheels — outer rim, barrel, spokes (idling), hub */}
          {[{ cx: 702 }, { cx: 252 }].map(({ cx }, i) => (
            <g key={cx}>
              <motion.circle cx={cx} cy="232" r="40" stroke="hsl(var(--fg))" strokeOpacity="0.8" strokeWidth="2.5" {...draw(0.9 + i * 0.2, 1.1)} />
              <motion.circle cx={cx} cy="232" r="24" stroke="hsl(var(--muted))" strokeOpacity="0.6" strokeWidth="1.5" {...draw(1.2 + i * 0.2, 0.9)} />
              <g transform={`translate(${cx} 232)`}>
                <motion.g
                  style={{ transformBox: "fill-box", transformOrigin: "center" }}
                  initial={{ opacity: 0 }}
                  animate={reduced ? { opacity: 1 } : { opacity: 1, rotate: 360 }}
                  transition={{
                    opacity: { duration: 0.6, delay: 1.35 + i * 0.2 },
                    rotate: { duration: 11, repeat: Infinity, ease: "linear", delay: 3 },
                  }}
                >
                  {[0, 60, 120].map((deg) => (
                    <line key={deg} x1="0" y1="-20" x2="0" y2="20"
                      transform={`rotate(${deg})`}
                      stroke="hsl(var(--muted))" strokeOpacity="0.45" strokeWidth="1.5" />
                  ))}
                </motion.g>
              </g>
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

          {/* ── ambient appraisal loop ───────────────────────────────────────── */}

          {/* scanner sweep */}
          {!reduced && (
            <motion.g
              data-testid="hero-scanner"
              initial={{ x: 90, opacity: 0 }}
              animate={{ x: [90, 90, 860, 860], opacity: [0, 0, 0.9, 0.9, 0, 0] }}
              transition={{
                x: { ...LOOP, times: [0, 0.03, 0.31, 1] },
                opacity: { ...LOOP, times: [0, 0.02, 0.05, 0.29, 0.33, 1] },
              }}
            >
              <rect x="-26" y="70" width="26" height="188" fill="url(#scanGlow)" />
              <line x1="0" y1="70" x2="0" y2="258" stroke="url(#scanStroke)" strokeWidth="2" />
            </motion.g>
          )}

          {/* findings — box + confidence chip, revealed as the scanner passes */}
          {FINDINGS.map(({ label, tone, box, chip }) => {
            const t = hitAt(box.x + box.w / 2);
            return (
              <motion.g key={label} data-testid="hero-finding" {...appear(t, 0.95)}>
                <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="3"
                  stroke={`hsl(var(${tone}))`} strokeWidth="1.5" strokeOpacity="0.9"
                  fill={`hsl(var(${tone}))`} fillOpacity="0.07" />
                <rect x={chip.x} y={box.y - 20} width={chip.w} height="16" rx="4"
                  fill="hsl(var(--surface))" fillOpacity="0.92"
                  stroke={`hsl(var(${tone}))`} strokeOpacity="0.5" />
                <text x={chip.x + chip.w / 2} y={box.y - 8} textAnchor="middle"
                  fill="hsl(var(--fg))" fillOpacity="0.9" fontSize="10" letterSpacing="1"
                  fontFamily="var(--font-mono)">
                  {label}
                </text>
              </motion.g>
            );
          })}

          {/* price readout — lands inside the scan frame once the sweep completes */}
          <motion.g data-testid="hero-price" {...appear(0.36, 1)}>
            <rect x="340" y="61" width="220" height="22" rx="11"
              fill="hsl(var(--surface))" fillOpacity="0.92"
              stroke="hsl(var(--accent))" strokeOpacity="0.5" />
            <text x="450" y="76" textAnchor="middle" fill="hsl(var(--fg))" fillOpacity="0.9"
              fontSize="10.5" letterSpacing="1" fontFamily="var(--font-mono)">
              EST. <tspan fill="hsl(var(--accent))" fillOpacity="1">AED 127,900</tspan> · ADJUSTED
            </text>
          </motion.g>
        </motion.g>

        {/* ── skid marks — left on the ground by the drift (root-level, don't move with the car) ── */}
        {!reduced && (
          <>
            <motion.path d="M 210 258 Q 252 254 300 258" stroke="hsl(var(--muted))" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: [0, 1, 1, 0] }}
              transition={{ pathLength: { duration: 0.9, ease: EASE, delay: 2.3 }, opacity: { duration: 2.5, delay: 2.3, times: [0, 0.1, 0.5, 1] } }} />
            <motion.path d="M 660 258 Q 703 254 750 258" stroke="hsl(var(--muted))" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: [0, 1, 1, 0] }}
              transition={{ pathLength: { duration: 0.9, ease: EASE, delay: 2.4 }, opacity: { duration: 2.5, delay: 2.4, times: [0, 0.1, 0.5, 1] } }} />
          </>
        )}

        {/* ── tire smoke — puffs behind each wheel as the drift settles (root-level) ── */}
        {!reduced && [702, 252].map((cx) => (
          <g key={`smoke-${cx}`}>
            {[0, 1, 2, 3].map((i) => (
              <motion.circle
                key={i} cx={cx} cy="232" r="6" fill="url(#smokePuff)"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 2.2 + i * 0.4], opacity: [0, 0.35, 0] }}
                transition={{ duration: 1.1, delay: 2.35 + i * 0.08, ease: EASE }}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
            ))}
          </g>
        ))}
      </svg>
    </motion.div>
  );
}
