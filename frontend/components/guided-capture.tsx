"use client";
import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Check, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * M1 — guided walk-around capture.
 *
 * Turns "upload some photos" into a short inspection ritual: eight angles, each with an
 * orientation dial showing exactly where to stand. This matters beyond feel — the detector
 * only finds damage it can see, so coverage is the single biggest lever on scan quality.
 * Every slot feeds the same on-device CV pipeline as the quick uploader.
 */
export interface Angle {
  id: string;
  label: string;
  /** where the camera stands, in degrees (0 = front of the car) */
  deg: number;
}

export const ANGLES: Angle[] = [
  { id: "front", label: "Front", deg: 0 },
  { id: "front-right", label: "Front right", deg: 45 },
  { id: "right", label: "Right side", deg: 90 },
  { id: "rear-right", label: "Rear right", deg: 135 },
  { id: "rear", label: "Rear", deg: 180 },
  { id: "rear-left", label: "Rear left", deg: 225 },
  { id: "left", label: "Left side", deg: 270 },
  { id: "front-left", label: "Front left", deg: 315 },
];

/** Small dial: a car seen from above, with the shooting position highlighted. */
function AngleDial({ deg, done }: { deg: number; done: boolean }) {
  const r = 15;
  const rad = ((deg - 90) * Math.PI) / 180; // 0deg = front = top of the dial
  const cx = 20 + r * Math.cos(rad);
  const cy = 20 + r * Math.sin(rad);
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
      <circle cx="20" cy="20" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="1.5" strokeDasharray="2 3" />
      {/* car body from above */}
      <rect x="15.5" y="12" width="9" height="16" rx="3.2"
        fill={done ? "hsl(var(--good))" : "hsl(var(--muted))"} fillOpacity={done ? 0.28 : 0.18}
        stroke={done ? "hsl(var(--good))" : "hsl(var(--muted))"} strokeWidth="1" />
      <line x1="15.5" y1="17" x2="24.5" y2="17" stroke={done ? "hsl(var(--good))" : "hsl(var(--muted))"} strokeWidth="0.9" />
      {/* camera position */}
      <circle cx={cx} cy={cy} r="3.6" fill={done ? "hsl(var(--good))" : "hsl(var(--accent))"} />
    </svg>
  );
}

export function GuidedCapture({
  onPhotos, max = 8,
}: {
  onPhotos: (photos: string[]) => void;
  max?: number;
}) {
  const [slots, setSlots] = useState<(string | null)[]>(() => ANGLES.map(() => null));
  const inputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<number>(0);

  const filled = useMemo(() => slots.filter(Boolean).length, [slots]);
  const coverage = Math.round((filled / ANGLES.length) * 100);

  function push(next: (string | null)[]) {
    setSlots(next);
    onPhotos(next.filter(Boolean).slice(0, max) as string[]);
  }

  function pick(i: number) {
    targetRef.current = i;
    inputRef.current?.click();
  }

  function onFile(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const next = [...slots];
      next[targetRef.current] = reader.result as string;
      push(next);
    };
    reader.readAsDataURL(f);
    if (inputRef.current) inputRef.current.value = ""; // allow re-picking the same file
  }

  function clearSlot(i: number) {
    const next = [...slots];
    next[i] = null;
    push(next);
  }

  const R = 16, C = 2 * Math.PI * R;

  return (
    <div className="rounded-2xl border p-4">
      {/* header + coverage ring */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Walk around your car</p>
          <p className="text-xs text-muted">
            {filled === 0
              ? "Eight angles — the detector can only price damage it can see."
              : filled === ANGLES.length
                ? "Full coverage — every angle captured."
                : `${filled} of ${ANGLES.length} angles captured.`}
          </p>
        </div>
        <div className="relative shrink-0">
          <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90" aria-hidden>
            <circle cx="20" cy="20" r={R} fill="none" stroke="hsl(var(--surface-2))" strokeWidth="4" />
            <motion.circle
              cx="20" cy="20" r={R} fill="none" stroke="hsl(var(--accent))" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={C} animate={{ strokeDashoffset: C - (C * coverage) / 100 }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </svg>
          <span className="tnum absolute inset-0 grid place-items-center text-[10px] font-semibold" aria-label={`${coverage}% coverage`}>
            {coverage}%
          </span>
        </div>
      </div>

      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => onFile(e.target.files)} />

      <div className="grid grid-cols-4 gap-2">
        {ANGLES.map((a, i) => {
          const src = slots[i];
          return (
            <div key={a.id} className="relative">
              <button
                type="button"
                onClick={() => pick(i)}
                aria-label={src ? `Replace the ${a.label} photo` : `Capture the ${a.label} angle`}
                className={cn(
                  "group flex w-full flex-col items-center gap-1 rounded-xl border p-2 transition focus:outline-none focus:ring-2 focus:ring-accent/50",
                  src ? "border-good/40 bg-good/6" : "hairline hover:border-accent/50 hover:bg-surface-2/60",
                )}
              >
                {src ? (
                  <span className="relative h-10 w-10 overflow-hidden rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={a.label} className="h-full w-full object-cover" />
                    <span className="absolute inset-0 grid place-items-center bg-black/35 opacity-0 transition group-hover:opacity-100">
                      <RotateCcw className="h-3.5 w-3.5 text-white" />
                    </span>
                  </span>
                ) : (
                  <AngleDial deg={a.deg} done={false} />
                )}
                <span className={cn("text-[10px] font-medium leading-tight", src ? "text-good" : "text-muted")}>
                  {a.label}
                </span>
              </button>

              {src ? (
                <button
                  type="button"
                  onClick={() => clearSlot(i)}
                  aria-label={`Remove the ${a.label} photo`}
                  className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white transition hover:bg-bad"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : (
                <span className="pointer-events-none absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-surface-2 text-muted">
                  <Camera className="h-2.5 w-2.5" />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {filled === ANGLES.length && (
        <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex items-center gap-1.5 text-xs font-medium text-good">
          <Check className="h-3.5 w-3.5" /> Full walk-around captured — every panel is in view of the detector.
        </motion.p>
      )}
    </div>
  );
}
