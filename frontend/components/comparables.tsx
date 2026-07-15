"use client";
import { motion } from "framer-motion";
import { Search, ExternalLink, MapPin, AlertTriangle } from "lucide-react";
import type { Comparable } from "@/lib/types";
import { SectionCard, Pill } from "./ui";
import { aed, km, titleCase } from "@/lib/utils";

export function Comparables({ items }: { items: Comparable[] }) {
  const flagged = items.filter((c) => c.price_anomaly).length;
  return (
    <SectionCard title="Comparable listings" subtitle="Hybrid retrieval over real Dubizzle cars" icon={<Search className="h-4.5 w-4.5" />}
      right={flagged
        ? <Pill tone="warn">{flagged} to verify</Pill>
        : <Pill tone="accent">{items.length} matches</Pill>}>
      <div className="space-y-2">
        {items.map((c, i) => (
          <motion.a
            key={c.listing_id} href={c.url} target="_blank" rel="noreferrer"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ x: 3 }}
            className="group flex flex-col gap-2 rounded-xl border bg-surface-2/40 p-3 transition hover:border-accent/40 hover:bg-surface-2"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent/10 tnum text-xs font-semibold text-accent">
                {Math.round(c.similarity * 100)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.year} {titleCase(c.make)} {titleCase(c.model)}</p>
                <p className="flex items-center gap-2 text-xs text-muted">
                  <span className="tnum">{km(c.kilometers)}</span>
                  <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{c.city}</span>
                  <span className="hidden sm:inline">· {c.sellerType}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="tnum text-sm font-semibold">{aed(c.price_aed)}</p>
                <p className="flex items-center justify-end gap-1 text-[11px] text-muted">
                  #{c.listing_id} <ExternalLink className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
                </p>
              </div>
            </div>

            {/* E5 — implausibly cheap for its own specs. Phrased as a prompt to check, not an
                accusation: ~1 in 40 genuine listings is this far below the model. */}
            {c.price_anomaly && (
              <p className="flex items-start gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-warn">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-semibold">Too good to be true?</span>{" "}
                  {c.price_anomaly.below_fair_pct}% below the {aed(c.price_anomaly.fair_price_aed)} its
                  specs predict. Worth verifying the odometer and accident history before trusting this price.
                </span>
              </p>
            )}
          </motion.a>
        ))}
      </div>
    </SectionCard>
  );
}
