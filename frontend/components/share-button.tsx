"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, Check, Loader2, AlertTriangle } from "lucide-react";
import type { ValuationResult } from "@/lib/types";
import { shareValuation } from "@/lib/supabase";

/**
 * Phase D — publish a read-only copy of this valuation and copy the link.
 * Works for guests (the shared table is public by design; the slug is the capability).
 * Photos are stripped before anything leaves the device.
 */
export function ShareButton({ result }: { result: ValuationResult }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [url, setUrl] = useState("");

  async function share() {
    if (state === "busy") return;
    setState("busy");
    try {
      const slug = await shareValuation(result);
      const link = `${window.location.origin}/r/${slug}`;
      setUrl(link);
      try { await navigator.clipboard.writeText(link); } catch { /* clipboard blocked — link still shown */ }
      setState("done");
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 4000);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={share}
        disabled={state === "busy"}
        aria-label="Share this valuation"
        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs text-muted transition hover:border-accent/40 hover:text-accent disabled:opacity-60"
      >
        {state === "busy" ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : state === "done" ? <Check className="h-3.5 w-3.5 text-good" />
          : state === "error" ? <AlertTriangle className="h-3.5 w-3.5 text-warn" />
          : <Share2 className="h-3.5 w-3.5" />}
        {state === "done" ? "Link copied" : state === "error" ? "Unavailable" : "Share"}
      </button>

      <AnimatePresence>
        {state === "done" && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.96 }}
            className="absolute right-0 top-9 z-30 w-max max-w-[260px] rounded-xl border bg-surface p-2.5 text-[11px] shadow-lift"
          >
            <p className="mb-1 font-semibold text-good">Public link ready</p>
            <a href={url} target="_blank" rel="noreferrer" className="break-all text-accent underline">{url}</a>
          </motion.div>
        )}
        {state === "error" && (
          <motion.p
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute right-0 top-9 z-30 w-max max-w-[240px] rounded-xl border bg-surface p-2.5 text-[11px] text-muted shadow-lift"
          >
            Sharing isn&apos;t set up yet — run <code className="text-accent">supabase_shared_schema.sql</code> to enable it.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
