"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, ScanLine, Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "./button";

const KEY = "av_onboarded_v1";

const STEPS = [
  {
    icon: <ScanLine className="h-5 w-5" />,
    title: "Scanned on your device",
    body: "Add photos and a trained YOLOv8 detector runs entirely in your browser — your images never leave your device, and the damage it finds adjusts the price.",
  },
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: "Explained, not asserted",
    body: "Every valuation shows the exact factors that moved the price, the comparable listings behind it, and an honest confidence range — not just a number.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "Every figure is checked",
    body: "The written report and the assistant are passed through a Verifier: any number that doesn't trace back to a computed value is rejected before you see it.",
  },
];

/**
 * First-visit tour (3 steps). Shown once, remembered in localStorage, fully dismissible
 * and keyboard-accessible. Deliberately explains the three things that make this product
 * different rather than pointing at buttons.
 */
export function Onboarding() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setTimeout(() => setOpen(true), 900);
    } catch { /* private mode — just skip the tour */ }
  }, []);

  function close() {
    setOpen(false);
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={close} className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-sm"
          />
          {/* Centre with flex, NOT translate: framer-motion writes its own inline transform
              (scale/y), which overrides Tailwind's -translate-x-1/2/-translate-y-1/2 and
              leaves the dialog hanging off the right/bottom edge on narrow screens. */}
          <div className="fixed inset-0 z-[71] grid place-items-center overflow-y-auto p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 14 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
            role="dialog" aria-modal="true" aria-label="Welcome to AutoValuate"
            className="relative w-full max-w-[420px] rounded-2xl border bg-surface p-6 shadow-lift"
          >
            <button onClick={close} aria-label="Skip the tour"
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg">
              <X className="h-4 w-4" />
            </button>

            <AnimatePresence mode="wait">
              <motion.div key={i}
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.22 }}>
                <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-accent/12 text-accent">{step.icon}</div>
                <h2 className="text-lg font-semibold tracking-tight">{step.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 flex items-center justify-between">
              <div className="flex gap-1.5" aria-hidden>
                {STEPS.map((_, n) => (
                  <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-accent" : "w-1.5 bg-border"}`} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={close} className="rounded-lg px-2.5 py-1.5 text-xs text-muted transition hover:text-fg">Skip</button>
                <Button
                  size="sm"
                  onClick={() => (last ? close() : setI(i + 1))}
                  className="gap-1.5 px-3.5 text-sm"
                >
                  {last ? "Value my car" : "Next"} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
