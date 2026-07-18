"use client";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ClipboardList, Copy, Check, Tag } from "lucide-react";
import type { ValuationResult } from "@/lib/types";
import { aed, km, titleCase } from "@/lib/utils";
import { SectionCard, Pill } from "./ui";

/**
 * Listing pack — closes the seller's actual job.
 *
 * A valuation is not the goal; the listing is. This turns the computed result into the two
 * things a seller pastes into Dubizzle: a recommended asking price and a ready listing text.
 * Deterministic like the negotiation coach — every number is the model's (high/mid/low) or
 * the scan's, so nothing here can be invented. The ask reuses the negotiation corridor
 * exactly (open at high, settle near mid), so the two cards can never disagree.
 */

/** Round the ask DOWN to a clean 500 step (a "47,500" reads like a price, "47,731" like a
 *  spreadsheet), but never below the fair mid — the discount lives in negotiation, not here. */
function cleanAsk(mid: number, high: number): number {
  return Math.max(Math.round(mid), Math.floor(high / 500) * 500);
}

const FMT_DAMAGE: Record<string, string> = {
  dent: "dent", scratch: "scratch", crack: "crack", glass_shatter: "glass damage",
  lamp_broken: "broken lamp", tire_flat: "flat tire", punctured: "puncture",
  missing_part: "missing part",
};

function buildListing(result: ValuationResult, ask: number): { title: string; body: string } {
  const v = result.vehicle;
  const { valuation, condition } = result;
  const name = `${v.year} ${titleCase(String(v.make))} ${titleCase(String(v.model))}`;

  const title = `${name} · ${km(v.kilometers ?? 0)} · ${v.regionalSpecs ?? "GCC"} specs — ${aed(ask)}`;

  // Spec lines only from fields the form actually captured — no invented selling points.
  const specs = [
    `Mileage: ${km(v.kilometers ?? 0)}`,
    v.bodyType && `Body: ${v.bodyType}`,
    v.transmissionType && `Transmission: ${v.transmissionType}`,
    v.fuelType && `Fuel: ${v.fuelType}`,
    v.noOfCylinders && `Cylinders: ${v.noOfCylinders}`,
    v.regionalSpecs && `Specs: ${v.regionalSpecs}`,
    v.city && `Location: ${v.city}`,
  ].filter(Boolean).join("\n");

  // Condition: disclose what the scan found (surprises kill deals — same doctrine as the
  // negotiation coach), or say honestly that no scan ran. Never imply an inspection happened.
  let cond: string;
  if (condition.cv_available && condition.findings.length > 0) {
    const items = condition.findings
      .map((f) => `${FMT_DAMAGE[f.damage_type] ?? f.damage_type.replace(/_/g, " ")}${f.severity ? ` (${f.severity})` : ""}`)
      .join(", ");
    cond = `Condition: ${condition.condition_score}/100 on an AI photo scan — disclosed up front: ${items}. Priced accordingly.`;
  } else if (condition.cv_available) {
    cond = `Condition: ${condition.condition_score}/100 on an AI photo scan — no visible damage detected.`;
  } else {
    cond = "Condition: no photo scan run — viewing and inspection welcome.";
  }

  const body = [
    name,
    "",
    specs,
    "",
    cond,
    "",
    `Asking ${aed(ask)} — based on a market valuation of ${aed(valuation.price_low_aed)}–${aed(valuation.price_high_aed)} (fair mid ${aed(valuation.price_mid_aed)}) from live UAE comparables.`,
    "",
    "Serious buyers welcome. AI-assisted estimate — not a certified appraisal.",
  ].join("\n");

  return { title, body };
}

export function ListingPack({ result }: { result: ValuationResult }) {
  const [copied, setCopied] = useState<"title" | "body" | null>(null);

  const mid = result.valuation.price_mid_aed;
  const high = result.valuation.price_high_aed;
  const ask = useMemo(() => cleanAsk(mid, high), [mid, high]);
  const listing = useMemo(() => buildListing(result, ask), [result, ask]);

  const copy = async (which: "title" | "body", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    } catch { /* clipboard may be blocked; ignore */ }
  };

  return (
    <SectionCard
      title="Listing pack"
      subtitle="A ready-to-paste ask and listing text — every number is the model's"
      icon={<ClipboardList className="h-4.5 w-4.5" />}
      right={<Pill tone="info">deterministic · no AI guesswork</Pill>}
    >
      {/* the recommended ask */}
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-accent/25 bg-accent/8 px-4 py-3">
        <Tag className="h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Recommended listing price</p>
          <p className="tnum text-2xl font-semibold text-accent">{aed(ask)}</p>
        </div>
        <p className="max-w-[16rem] text-xs leading-relaxed text-muted">
          Anchored at the top of the fair range so there&apos;s room to settle near the{" "}
          <span className="tnum font-medium text-fg">{aed(mid)}</span> mid — the same corridor
          the negotiation coach uses.
        </p>
      </div>

      {/* the listing text */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2 rounded-xl border bg-surface-2/40 p-3">
          <p className="min-w-0 text-sm font-medium">{listing.title}</p>
          <button onClick={() => copy("title", listing.title)} aria-label="Copy listing title"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs text-muted transition hover:border-accent/40 hover:text-accent">
            {copied === "title" ? <Check className="h-3 w-3 text-good" /> : <Copy className="h-3 w-3" />} title
          </button>
        </div>

        <motion.pre initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border bg-surface-2/40 p-3 font-sans text-xs leading-relaxed text-fg/90">
          {listing.body}
        </motion.pre>

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted">
            Built only from your form entries, the scan, and the model — nothing is embellished.
            Damage found by the scan is disclosed on purpose: surprises kill deals.
          </p>
          <button onClick={() => copy("body", listing.body)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-accent">
            {copied === "body" ? <><Check className="h-3.5 w-3.5 text-good" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy listing</>}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}
