"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Send, Sparkles, ShieldCheck, Loader2, Quote } from "lucide-react";
import type { ValuationResult } from "@/lib/types";
import { askAssistant } from "@/lib/api";
import { SUGGESTED_PROMPTS, type ChatTurn } from "@/lib/assistant";
import { chunkReport, displayForCitation } from "@/lib/report";
import { SectionCard, Pill } from "./ui";

/** Renders an answer with its [id] markers as interactive, evidence-backed citation chips. */
function GroundedText({ text, result }: { text: string; result: ValuationResult }) {
  const [open, setOpen] = useState<string | null>(null);
  const chunks = chunkReport(text);
  return (
    <span>
      {chunks.map((c, i) => {
        if (!c.cite) return <span key={i}>{c.text}</span>;
        const id = c.cite;
        const value = displayForCitation(result.evidence, id);
        const label = c.injected && /\d/.test(value) ? value : id;
        const detail = Object.values(result.evidence).find((g) => g?.[id])?.[id];
        return (
          <button
            key={i}
            onClick={() => setOpen(open === `${i}` ? null : `${i}`)}
            aria-label={`Source ${id}`}
            className="relative mx-0.5 inline-flex items-center rounded-md bg-accent/12 px-1.5 py-0.5 align-baseline text-[11px] font-semibold text-accent transition hover:bg-accent/20"
          >
            {label}
            <AnimatePresence>
              {open === `${i}` && detail && (
                <motion.span
                  initial={{ opacity: 0, y: 6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  className="absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[240px] -translate-x-1/2 rounded-xl border bg-surface p-2.5 text-left text-[11px] font-normal text-fg shadow-lift"
                >
                  <span className="mb-1 flex items-center gap-1 font-semibold text-accent"><Quote className="h-3 w-3" />source {id}</span>
                  <span className="text-muted">{Object.entries(detail).map(([k, v]) => `${k}: ${v}`).join(" · ")}</span>
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        );
      })}
    </span>
  );
}

export function Assistant({ result }: { result: ValuationResult }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTurns([]); }, [result.valuation.price_mid_aed]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [turns, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((p) => [...p, { role: "user", content: q }]);
    setBusy(true);
    const reply = await askAssistant(q, result, history);
    setTurns((p) => [...p, {
      role: "assistant", content: reply.answer, provider: reply.provider,
      verified: reply.verified, numbers: reply.numbers, citations: reply.citations,
    }]);
    setBusy(false);
  }

  return (
    <SectionCard
      title="Ask the assistant"
      subtitle="Grounded in this valuation — every number is checked by the Verifier"
      icon={<MessageSquare className="h-4.5 w-4.5" />}
      right={<Pill tone="accent"><ShieldCheck className="h-3 w-3" /> grounded</Pill>}
    >
      {/* transcript */}
      <div className="max-h-[380px] space-y-3 overflow-y-auto pr-1" role="log" aria-live="polite">
        {turns.length === 0 && !busy && (
          <p className="text-sm text-muted">
            Ask anything about this valuation — the assistant may only use figures the pipeline computed,
            and any answer with an ungrounded number is rejected before you see it.
          </p>
        )}

        {turns.map((t, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
            {t.role === "user" ? (
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg">
                {t.content}
              </div>
            ) : (
              <div className="max-w-[90%] rounded-2xl rounded-bl-sm border bg-surface-2/60 px-3.5 py-2.5">
                <p className="text-sm leading-relaxed text-fg/90">
                  <GroundedText text={t.content} result={result} />
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-1.5 text-[11px] text-muted">
                  <ShieldCheck className={`h-3 w-3 ${t.verified ? "text-good" : "text-warn"}`} />
                  {t.verified
                    ? <span><span className="tnum text-fg">{t.numbers}</span> numbers · <span className="tnum text-fg">{t.citations}</span> citations verified</span>
                    : <span className="text-warn">flagged by the Verifier</span>}
                  <span className="text-dim">· via {t.provider}</span>
                </p>
              </div>
            )}
          </motion.div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" /> checking the evidence…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* suggested prompts */}
      {turns.length === 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((s) => (
            <button key={s} onClick={() => ask(s)} disabled={busy}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted transition hover:border-accent/40 hover:text-accent disabled:opacity-50">
              <Sparkles className="h-3 w-3" /> {s}
            </button>
          ))}
        </div>
      )}

      {/* composer */}
      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="mt-4 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          aria-label="Ask about this valuation"
          placeholder="Ask about the price, damage, or comparables…"
          className="w-full rounded-xl border bg-surface-2/60 px-3.5 py-2.5 text-sm outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/25 placeholder:text-muted/60"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg transition hover:brightness-105 disabled:opacity-50">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </SectionCard>
  );
}
