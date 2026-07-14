"use client";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, Trash2, Car } from "lucide-react";
import type { HistoryItem } from "@/lib/history";
import { aed } from "@/lib/utils";

export function HistoryDrawer({
  open, items, onClose, onSelect, onClear,
}: { open: boolean; items: HistoryItem[]; onClose: () => void; onSelect: (i: HistoryItem) => void; onClear: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
          <motion.aside
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="fixed right-0 top-0 z-50 flex h-dvh w-[min(88vw,380px)] flex-col border-l bg-surface"
          >
            <div className="flex items-center justify-between border-b px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-accent" /> Valuation history</div>
              <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {items.length === 0 ? (
                <div className="mt-16 text-center text-sm text-muted">
                  <Car className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  No saved valuations yet.
                </div>
              ) : items.map((it) => (
                <button key={it.id} onClick={() => onSelect(it)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border bg-surface-2/40 p-3 text-left transition hover:border-accent/40 hover:bg-surface-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{it.label}</p>
                    <p className="text-xs text-muted">{new Date(it.ts).toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short" })}</p>
                  </div>
                  <span className="tnum shrink-0 text-sm font-semibold text-accent">{aed(it.mid)}</span>
                </button>
              ))}
            </div>
            {items.length > 0 && (
              <div className="border-t p-3">
                <button onClick={onClear} className="flex w-full items-center justify-center gap-2 rounded-xl bg-surface-2 py-2.5 text-sm text-muted transition hover:text-bad">
                  <Trash2 className="h-4 w-4" /> Clear history
                </button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
