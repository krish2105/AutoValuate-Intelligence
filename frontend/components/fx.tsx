"use client";
/**
 * Grand-marque motion primitives — the tactile layer that makes the UI feel like a
 * top-marque configurator rather than a form. All interruptible, all GPU-cheap, all
 * silenced by the global prefers-reduced-motion kill-switch in globals.css.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Odometer-style count-up. Sweeps to `value` like a dial; re-sweeps on change. */
export function CountUp({
  value, format = (v: number) => Math.round(v).toLocaleString("en-AE"), duration = 1.1, className,
}: { value: number; format?: (v: number) => string; duration?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) { setShown(value); prev.current = value; return; }
    const controls = animate(prev.current, value, {
      duration, ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration, reduced]);

  return <span className={cn("tnum", className)}>{format(shown)}</span>;
}

/** Magnetic hover — the control leans toward the pointer, springs back on leave. */
export function Magnetic({ children, strength = 0.25, className }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [xy, setXy] = useState({ x: 0, y: 0 });
  const reduced = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={className}
      animate={{ x: xy.x, y: xy.y }}
      transition={{ type: "spring", stiffness: 220, damping: 18, mass: 0.5 }}
      onPointerMove={(e) => {
        if (reduced || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        setXy({ x: (e.clientX - (r.left + r.width / 2)) * strength, y: (e.clientY - (r.top + r.height / 2)) * strength });
      }}
      onPointerLeave={() => setXy({ x: 0, y: 0 })}
    >
      {children}
    </motion.div>
  );
}

/** Staggered word reveal for display headlines — each word rises from a clipped line. */
export function WordReveal({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom" aria-hidden>
          <motion.span
            className="inline-block will-change-transform"
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: delay + i * 0.07 }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 ? <span>&nbsp;</span> : null}
        </span>
      ))}
    </span>
  );
}

/** Telemetry ticker — an edge-faded, infinitely scrolling strip of spec chips. */
export function Ticker({ items, className }: { items: string[]; className?: string }) {
  const row = (key: string, hidden: boolean) => (
    <div key={key} aria-hidden={hidden} className="flex shrink-0 items-center">
      {items.map((it, i) => (
        <span key={i} className="flex items-center">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">{it}</span>
          <span className="mx-5 h-1 w-1 rounded-full bg-accent/60" />
        </span>
      ))}
    </div>
  );
  return (
    <div className={cn("ticker-mask overflow-hidden", className)}>
      <div className="ticker-track flex w-max animate-marquee">
        {row("a", false)}
        {row("b", true)}
      </div>
    </div>
  );
}
