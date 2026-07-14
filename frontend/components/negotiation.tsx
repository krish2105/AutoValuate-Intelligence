"use client";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Handshake, Copy, Check, TrendingUp, TrendingDown } from "lucide-react";
import type { ValuationResult } from "@/lib/types";
import { aed, titleCase } from "@/lib/utils";
import { SectionCard, Pill } from "./ui";

type Mode = "sell" | "buy";

interface Point {
  text: string;
  cite?: string;
  tone?: "good" | "warn" | "info" | "muted";
}

/**
 * Turns a valuation into a grounded negotiation plan — every number traces to the
 * model (mid/low/high), the live comparables, or the on-device condition. No LLM: it's
 * deterministic, so it can never invent a figure (same discipline as the Verifier).
 */
function buildPlan(result: ValuationResult, mode: Mode) {
  const { valuation: v, comparables, condition } = result;
  const low = v.price_low_aed, mid = v.price_mid_aed, high = v.price_high_aed;

  const prices = comparables.map((c) => c.price_aed).filter((p) => p > 0).sort((a, b) => a - b);
  const below = prices.filter((p) => p < mid).length;
  const percentile = prices.length ? Math.round((below / prices.length) * 100) : 50;
  const cheapest = comparables.filter((c) => c.price_aed > 0).sort((a, b) => a.price_aed - b.price_aed)[0];
  const priciest = comparables.filter((c) => c.price_aed > 0).sort((a, b) => b.price_aed - a.price_aed)[0];

  const damageAed = condition.cv_available && condition.total_value_impact_pct
    ? Math.round((mid / (condition.price_adjustment_factor || 1)) - mid)
    : 0;
  const topDamage = condition.findings?.[0];

  // Price anchors — seller opens high & holds the floor; buyer opens low & caps the ceiling.
  const anchors = mode === "sell"
    ? { open: high, openLabel: "Open your ask at", target: mid, floor: low, floorLabel: "Hold above" }
    : { open: low, openLabel: "Open your offer at", target: mid, floor: high, floorLabel: "Walk away above" };

  const points: Point[] = [];

  // 1) the model range
  points.push({
    text: mode === "sell"
      ? `The fair-market mid is ${aed(mid)} [V2]. Anchor near the top of the range, ${aed(high)} [V3], and don't drop below ${aed(low)} [V1] without a reason.`
      : `The fair-market mid is ${aed(mid)} [V2]. Open near the bottom, ${aed(low)} [V1], and treat ${aed(high)} [V3] as your ceiling.`,
    cite: "V2", tone: "info",
  });

  // 2) market position
  if (prices.length >= 2) {
    points.push({
      text: mode === "sell"
        ? percentile <= 50
          ? `Your estimate is cheaper than ${100 - percentile}% of ${prices.length} live comparables — you have room to ask higher and still look like a deal.`
          : `Your estimate sits above ${percentile}% of ${prices.length} comparables — justify it with condition, history, or extras, or expect pushback.`
        : percentile <= 50
          ? `This car is already priced below ${100 - percentile}% of ${prices.length} comparables — a fair, not desperate, deal. Push gently, not aggressively.`
          : `It's priced above ${percentile}% of ${prices.length} comparables — strong leverage to negotiate down toward the mid.`,
      tone: percentile <= 50 ? "good" : "warn",
    });
  }

  // 3) comparable anchors
  if (cheapest && priciest && cheapest.listing_id !== priciest.listing_id) {
    points.push({
      text: mode === "sell"
        ? `Cite the top comparable — a ${priciest.year} ${titleCase(priciest.make)} ${titleCase(priciest.model)} at ${aed(priciest.price_aed)} — to defend a higher ask.`
        : `Cite the cheapest comparable — a ${cheapest.year} ${titleCase(cheapest.make)} ${titleCase(cheapest.model)} at ${aed(cheapest.price_aed)} — to anchor them down.`,
      tone: "muted",
    });
  }

  // 4) condition / damage
  if (condition.cv_available && topDamage) {
    points.push({
      text: mode === "sell"
        ? `Buyers will spot the ${titleCase(topDamage.damage_type.replace("_", " "))}${damageAed ? ` (~${aed(damageAed)} off value)` : ""}. Disclose it up front and pre-price it in — surprises kill deals and trust.`
        : `The detected ${titleCase(topDamage.damage_type.replace("_", " "))}${damageAed ? ` is worth ~${aed(damageAed)}` : ""} off value [D1]. Get a repair quote and subtract it from your offer.`,
      cite: condition.source === "browser" ? "D1" : undefined,
      tone: "warn",
    });
  } else {
    points.push({
      text: mode === "sell"
        ? `No visible damage was detected — lead with that. Offer to let the buyer run their own photo scan to build trust.`
        : `No visible damage was detected, so don't over-discount for condition — the seller can justifiably hold firmer.`,
      tone: "good",
    });
  }

  // 5) confidence framing
  const width = result.confidence.valuation_interval_pct || v.interval_pct_width;
  points.push({
    text: `Model confidence is ${result.confidence.level} (±${Math.round(width / 2)}% band). ${
      result.confidence.level === "high"
        ? "The number is tight — negotiate close to the mid."
        : mode === "sell"
          ? "The range is wide, so a service history or inspection report lets you defend the higher end."
          : "The range is wide — ask for an inspection before committing near the top."
    }`,
    tone: "muted",
  });

  return { anchors, points, percentile };
}

function scriptText(result: ValuationResult, mode: Mode, plan: ReturnType<typeof buildPlan>) {
  const v = result.vehicle;
  const head = `${v.year} ${titleCase(String(v.make))} ${titleCase(String(v.model))} — ${mode === "sell" ? "seller" : "buyer"} negotiation plan`;
  const anchors = `${plan.anchors.openLabel}: ${aed(plan.anchors.open)} · Target: ${aed(plan.anchors.target)} · ${plan.anchors.floorLabel}: ${aed(plan.anchors.floor)}`;
  const body = plan.points.map((p, i) => `${i + 1}. ${p.text.replace(/\s*\[[A-Z]\d+\]/g, "")}`).join("\n");
  return `${head}\n\n${anchors}\n\n${body}\n\n— Generated by AutoValuate Intelligence (grounded, not a certified appraisal).`;
}

export function Negotiation({ result }: { result: ValuationResult }) {
  const [mode, setMode] = useState<Mode>("sell");
  const [copied, setCopied] = useState(false);
  const plan = useMemo(() => buildPlan(result, mode), [result, mode]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(scriptText(result, mode, plan));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard may be blocked; ignore */ }
  };

  const ToneDot = ({ tone }: { tone?: Point["tone"] }) => (
    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
      tone === "good" ? "bg-good" : tone === "warn" ? "bg-warn" : tone === "info" ? "bg-info" : "bg-muted"
    }`} />
  );

  return (
    <SectionCard
      title="Negotiation coach"
      subtitle="Grounded talking points — every figure traces to the model or a live listing"
      icon={<Handshake className="h-4.5 w-4.5" />}
      right={
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5 text-xs">
            {(["sell", "buy"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`rounded-md px-2.5 py-1 font-medium capitalize transition ${
                  mode === m ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"
                }`}>
                {m === "sell" ? "I'm selling" : "I'm buying"}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {/* anchors */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          { label: plan.anchors.openLabel, value: plan.anchors.open, tone: mode === "sell" ? "text-good" : "text-accent", icon: mode === "sell" ? TrendingUp : TrendingDown },
          { label: "Fair-market target", value: plan.anchors.target, tone: "text-accent", icon: Handshake },
          { label: plan.anchors.floorLabel, value: plan.anchors.floor, tone: mode === "sell" ? "text-bad" : "text-warn", icon: mode === "sell" ? TrendingDown : TrendingUp },
        ].map((a, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="rounded-xl border bg-surface-2/40 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{a.label}</p>
            <p className={`tnum mt-0.5 text-base font-semibold ${a.tone}`}>{aed(a.value)}</p>
          </motion.div>
        ))}
      </div>

      {/* talking points */}
      <ul className="space-y-2.5">
        {plan.points.map((p, i) => {
          const cites = Array.from(p.text.matchAll(/\[([A-Z]\d+)\]/g)).map((m) => m[1]);
          const clean = p.text.replace(/\s*\[[A-Z]\d+\]/g, "");
          return (
            <motion.li key={`${mode}-${i}`} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}
              className="flex gap-2.5 text-sm leading-relaxed text-fg/90">
              <ToneDot tone={p.tone} />
              <span>
                {clean}
                {cites.map((id) => (
                  <span key={id} className="ml-1 inline-flex items-center rounded bg-accent/12 px-1 py-0.5 align-baseline text-[10px] font-semibold text-accent">
                    {id}
                  </span>
                ))}
              </span>
            </motion.li>
          );
        })}
      </ul>

      <div className="mt-4 flex items-center justify-between border-t pt-3">
        <Pill tone="muted">deterministic · no AI guesswork</Pill>
        <button onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-accent">
          {copied ? <><Check className="h-3.5 w-3.5 text-good" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy script</>}
        </button>
      </div>
    </SectionCard>
  );
}
