"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import {
  Search, Command, CornerDownLeft, Car, Clock, Sun, Moon, FileText,
  MessageSquare, BarChart3, ShieldCheck, Gauge, Table2, KeyRound, GitCompareArrows,
} from "lucide-react";

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  /** extra search terms — users type "theme"/"dark", not the literal label */
  keywords?: string;
  icon: React.ReactNode;
  run: () => void;
}

/**
 * ⌘K / Ctrl-K command palette. Keyboard-first navigation for power users:
 * jump to any section, re-run a valuation, open history, flip the theme.
 * Fully keyboard-navigable (↑ ↓ ⏎ Esc) and screen-reader labelled.
 */
export function CommandPalette({
  onNewValuation, onOpenHistory, onScrollTo, hasResult,
}: {
  onNewValuation: () => void;
  onOpenHistory: () => void;
  onScrollTo: (id: string) => void;
  hasResult: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const { theme, setTheme } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);

  // global hotkey
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus the search box the instant the palette opens. The old `setTimeout(…, 40)` left a ~50ms
  // window where focus was still on <body>, so a user who pressed ⌘K and typed immediately (the
  // whole point of a command palette) lost their first keystrokes — "dealer" arrived as "aler"
  // and matched nothing, which read as "search doesn't work". Focus synchronously, then again on
  // the next paint to cover the mount animation, with no arbitrary delay.
  useEffect(() => {
    if (!open) return;
    setQ(""); setSel(0);
    const focus = () => inputRef.current?.focus();
    focus();
    const raf = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const actions: PaletteAction[] = useMemo(() => {
    const close = (fn: () => void) => () => { setOpen(false); fn(); };
    const base: PaletteAction[] = [
      { id: "new", label: "New valuation", hint: "value another car", keywords: "appraise start again reset vehicle", icon: <Car className="h-4 w-4" />, run: close(onNewValuation) },
      { id: "history", label: "Open history", hint: "past valuations", keywords: "saved recent previous", icon: <Clock className="h-4 w-4" />, run: close(onOpenHistory) },
      {
        id: "theme", label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        keywords: "theme dark light mode appearance contrast",
        icon: theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
        run: close(() => setTheme(theme === "dark" ? "light" : "dark")),
      },
      { id: "model", label: "Open the model report card", hint: "public metrics", keywords: "metrics eval accuracy map conformal faithfulness", icon: <ShieldCheck className="h-4 w-4" />, run: close(() => { window.location.href = "/model"; }) },
      { id: "dealer", label: "Fleet valuation (bulk CSV)", hint: "value many cars", keywords: "dealer bulk csv fleet inventory batch", icon: <Table2 className="h-4 w-4" />, run: close(() => { window.location.href = "/dealer"; }) },
      { id: "developers", label: "Developer API", hint: "open, no key", keywords: "api developer curl endpoint programmatic", icon: <KeyRound className="h-4 w-4" />, run: close(() => { window.location.href = "/developers"; }) },
      { id: "compare", label: "Compare cars (buyer mode)", hint: "best value", keywords: "compare buy shortlist side by side versus", icon: <GitCompareArrows className="h-4 w-4" />, run: close(() => { window.location.href = "/compare"; }) },
    ];
    if (!hasResult) return base;
    return [
      ...base,
      { id: "valuation", label: "Jump to the valuation", keywords: "price estimate value shap", icon: <Gauge className="h-4 w-4" />, run: close(() => onScrollTo("results")) },
      { id: "analytics", label: "Jump to market analytics", keywords: "charts graphs comparables mileage scatter", icon: <BarChart3 className="h-4 w-4" />, run: close(() => onScrollTo("results")) },
      { id: "report", label: "Jump to the seller report", keywords: "pdf export summary certificate", icon: <FileText className="h-4 w-4" />, run: close(() => onScrollTo("results")) },
      { id: "assistant", label: "Ask the assistant", keywords: "chat question ai help", icon: <MessageSquare className="h-4 w-4" />, run: close(() => onScrollTo("results")) },
    ];
  }, [theme, setTheme, hasResult, onNewValuation, onOpenHistory, onScrollTo]);

  // Forgiving search: every query token must either be a substring of the haystack or
  // share a ≥3-char prefix with some word ("validate" still finds "valuation"). If
  // nothing survives, fall back to ALL commands — a palette must never dead-end, or
  // Enter silently does nothing and the whole thing feels broken.
  const { results, fallback } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return { results: actions, fallback: false };
    const tokens = needle.split(/\s+/);
    const matches = actions.filter((a) => {
      const hay = `${a.label} ${a.hint ?? ""} ${a.keywords ?? ""}`.toLowerCase();
      const words = hay.split(/[^a-z0-9]+/);
      return tokens.every((t) =>
        hay.includes(t) ||
        words.some((w) => {
          const n = Math.min(t.length, w.length, 4);
          return n >= 3 && w.slice(0, n) === t.slice(0, n);
        }),
      );
    });
    return matches.length > 0 ? { results: matches, fallback: false } : { results: actions, fallback: true };
  }, [q, actions]);

  useEffect(() => { setSel(0); }, [q]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); results[sel]?.run(); }
  }

  return (
    <>
      {/* discoverability affordance in the header */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
        className="hidden items-center gap-1.5 rounded-full border bg-surface/70 px-2.5 py-2 text-[11px] font-medium text-muted backdrop-blur transition hover:bg-surface-2 hover:text-fg sm:inline-flex"
      >
        <Command className="h-3.5 w-3.5" /> K
      </button>

      {/* No <AnimatePresence>: if its exit-complete callback fails to fire (observed with
          rapidly swapping children elsewhere on this page), the palette gets STUCK open
          after running a command. Closing instantly is the correct trade for an overlay
          that must never wedge; opening still animates via initial/animate. */}
      {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm"
            />
            {/* flex-centred: framer's inline transform would clobber a Tailwind translate */}
            <div className="fixed inset-0 z-[61] flex items-start justify-center overflow-y-auto p-4 pt-[14vh]">
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              role="dialog" aria-modal="true" aria-label="Command palette"
              className="relative w-full max-w-[520px] overflow-hidden rounded-2xl border bg-surface shadow-lift"
            >
              <div className="flex items-center gap-2 border-b px-3.5">
                <Search className="h-4 w-4 shrink-0 text-muted" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onKeyDown}
                  aria-label="Search commands"
                  placeholder="Type a command…"
                  className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-muted/60"
                />
                <kbd className="hidden shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted sm:block">esc</kbd>
              </div>

              <ul className="max-h-[320px] overflow-y-auto p-1.5" role="listbox">
                {fallback && (
                  <li className="px-3 pb-1 pt-2 text-[11px] text-muted" aria-live="polite">
                    No exact match for “{q.trim()}” — all commands:
                  </li>
                )}
                {results.map((a, i) => (
                  <li key={a.id} role="option" aria-selected={i === sel}>
                    <button
                      onMouseEnter={() => setSel(i)}
                      onClick={a.run}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                        i === sel ? "bg-accent/12 text-accent" : "text-fg hover:bg-surface-2"
                      }`}
                    >
                      <span className={i === sel ? "text-accent" : "text-muted"}>{a.icon}</span>
                      <span className="flex-1">{a.label}</span>
                      {a.hint && <span className="hidden text-[11px] text-muted sm:block">{a.hint}</span>}
                      {i === sel && <CornerDownLeft className="h-3.5 w-3.5 text-accent" />}
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
            </div>
          </>
        )}
    </>
  );
}
