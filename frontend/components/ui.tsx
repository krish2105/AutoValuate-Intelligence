"use client";
import { motion } from "framer-motion";
import { Gauge } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SectionCard({
  title, subtitle, icon, children, className, right,
}: { title: string; subtitle?: string; icon?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={cn("card p-5 sm:p-6", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {icon && <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">{icon}</div>}
          <div>
            <h2 className="text-sm font-semibold tracking-tight sm:text-base">{title}</h2>
            {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-fg shadow-glow">
        <Gauge className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">AutoValuate</div>
        <div className="-mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted">Intelligence</div>
      </div>
    </div>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "good" | "warn" | "bad" | "info" | "accent" }) {
  const tones: Record<string, string> = {
    muted: "bg-surface-2 text-muted",
    good: "bg-good/12 text-good",
    warn: "bg-warn/12 text-warn",
    bad: "bg-bad/12 text-bad",
    info: "bg-info/12 text-info",
    accent: "bg-accent/12 text-accent",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium", tones[tone])}>{children}</span>;
}
