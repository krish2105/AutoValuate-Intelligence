"use client";
/**
 * Cinematic "unveil" hero — grand-marque energy on free tier: pointer-tracked
 * spotlight, expanded-caps display type, a self-drawing GT silhouette, a telemetry
 * ticker of honest model stats, and a magnetic CTA that scrolls to the appraisal.
 */
import { useRef } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Sparkles } from "lucide-react";
import { HeroCar } from "./hero-car";
import { Magnetic, Ticker, WordReveal } from "./fx";

const TELEMETRY = [
  "YOLOv8 · mAP@0.5 0.732", "8 damage classes", "672 real UAE listings",
  "conformal 77.6% coverage", "SHAP-traced pricing", "on-device CV — photos never leave your browser",
  "verifier-grounded citations", "Dubai → Fujairah",
];

export function Hero({ onBegin }: { onBegin: () => void }) {
  const ref = useRef<HTMLElement>(null);

  return (
    <section
      ref={ref}
      onPointerMove={(e) => {
        const el = ref.current; if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      className="spotlight relative -mx-4 mb-10 flex min-h-[78vh] flex-col items-center justify-center overflow-hidden px-4 pt-10 text-center sm:-mx-6 sm:px-6"
    >
      {/* kicker */}
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} className="kicker mb-5">
        Computer vision · Explainable ML · Agentic RAG
      </motion.p>

      {/* display headline */}
      <h1 className="display-title max-w-4xl text-balance text-[2.6rem] font-bold uppercase sm:text-7xl">
        <WordReveal text="Know what your car" delay={0.15} />
        <br />
        <WordReveal text="is" delay={0.5} />{" "}
        <span className="text-accent"><WordReveal text="really" delay={0.58} /></span>{" "}
        <WordReveal text="worth" delay={0.68} />
      </h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.6 }}
        className="mx-auto mt-5 max-w-xl text-pretty text-sm text-muted sm:text-base"
      >
        A damage-aware, fully explainable fair-market valuation for the UAE — every number
        traceable to a trained model, a live listing, or a verified citation.
      </motion.p>

      {/* CTA */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.6 }} className="mt-7">
        <Magnetic>
          <button
            onClick={onBegin}
            className="group relative overflow-hidden rounded-full bg-accent px-8 py-3.5 text-sm font-semibold uppercase tracking-[0.14em] text-accent-fg shadow-glow transition hover:brightness-105"
          >
            <span className="relative z-10 inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Begin appraisal
            </span>
            {/* shine sweep */}
            <span aria-hidden className="absolute inset-y-0 left-0 w-1/3 animate-sheen bg-white/25" />
          </button>
        </Magnetic>
      </motion.div>

      {/* the unveil */}
      <HeroCar className="mt-6 w-full max-w-3xl" />

      {/* telemetry ticker */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6, duration: 0.8 }}
        className="mt-4 w-full max-w-4xl border-y py-3 hairline">
        <Ticker items={TELEMETRY} />
      </motion.div>

      {/* scroll cue */}
      <motion.button
        onClick={onBegin} aria-label="Scroll to the appraisal form"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2 }}
        className="mt-6 grid h-10 w-10 place-items-center rounded-full border text-muted transition hover:text-fg"
      >
        <ChevronDown className="h-4 w-4 animate-bounce" />
      </motion.button>
    </section>
  );
}
