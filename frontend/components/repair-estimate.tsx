"use client";
import { motion } from "framer-motion";
import { Wrench, TrendingUp } from "lucide-react";
import type { ValuationResult } from "@/lib/types";
import { aed, titleCase } from "@/lib/utils";
import { SectionCard, Pill } from "./ui";

const SEV_TONE: Record<string, "good" | "warn" | "bad"> = {
  minor: "good",
  moderate: "warn",
  severe: "bad",
};

/**
 * Phase F — itemised repair estimate.
 *
 * Closes the causal loop the product is built on: the detector found this damage, that
 * damage cost you this much value, and here is what it would cost to put right. The
 * "worth fixing?" comparison is the decision the seller actually has to make.
 */
export function RepairEstimateCard({ result }: { result: ValuationResult }) {
  const repair = result.repair;
  if (!repair?.available || repair.items.length === 0) return null;

  const { total_low_aed: lo, total_high_aed: hi, items } = repair;
  const mid = result.valuation.price_mid_aed;
  // what the damage took off the price, per the same condition factor that adjusted it
  const factor = result.valuation.condition_factor ?? 1;
  const lostValue = factor < 1 ? Math.round(mid / factor - mid) : 0;
  const repairMid = Math.round((lo + hi) / 2);
  const worthFixing = lostValue > repairMid;

  return (
    <SectionCard
      title="Repair estimate"
      subtitle="What the detected damage would cost to put right"
      icon={<Wrench className="h-4.5 w-4.5" />}
      right={<Pill tone="info">{items.length} item{items.length > 1 ? "s" : ""}</Pill>}
    >
      <div className="mb-4">
        <p className="text-xs text-muted">Estimated repair cost</p>
        <p className="tnum text-2xl font-semibold text-accent">{aed(lo)} – {aed(hi)}</p>
      </div>

      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <motion.li
            key={it.damage_type}
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
            className="flex items-center justify-between gap-3 rounded-xl border bg-surface-2/40 px-3 py-2"
          >
            <span className="flex items-center gap-2 text-sm">
              <span className="font-medium">{titleCase(it.damage_type.replace(/_/g, " "))}</span>
              {it.instances > 1 && <span className="text-xs text-muted">×{it.instances}</span>}
              <Pill tone={SEV_TONE[it.severity]}>{it.severity}</Pill>
            </span>
            <span className="tnum shrink-0 text-sm text-fg">{aed(it.low_aed)} – {aed(it.high_aed)}</span>
          </motion.li>
        ))}
      </ul>

      {lostValue > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-accent/25 bg-accent/8 px-3.5 py-3">
          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-sm leading-relaxed text-fg/90">
            This damage is costing you about <span className="tnum font-semibold text-accent">{aed(lostValue)}</span> in
            value, against a repair bill of roughly <span className="tnum font-semibold">{aed(repairMid)}</span>.{" "}
            {worthFixing
              ? "Repairing before you sell is likely to pay for itself."
              : "Repairing probably won't pay for itself — selling as-is and pricing it in is the safer call."}
          </p>
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted">
        Indicative UAE independent-workshop prices from a published table, scaled by detected severity and
        instance count — not a quote. Get a workshop to confirm before you decide.
      </p>
    </SectionCard>
  );
}
