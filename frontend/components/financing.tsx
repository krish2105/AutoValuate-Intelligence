"use client";
import { useMemo, useState } from "react";
import { Landmark, TriangleAlert } from "lucide-react";
import type { ValuationResult } from "@/lib/types";
import { aed } from "@/lib/utils";
import {
  computeFinancing, UAE_MAX_TENURE_MONTHS, UAE_MIN_DOWN_PAYMENT_PCT,
} from "@/lib/financing";
import { SectionCard, Pill } from "./ui";

/**
 * Monthly-payment estimator for the UAE market.
 *
 * The maths lives in lib/financing.ts (unit-tested) — this file is presentation only.
 *
 * Two deliberate choices worth keeping:
 *   1. We quote the monthly the way a UAE bank does (FLAT rate on the original principal),
 *      not the textbook reducing-balance formula. Reducing-balance would under-state the
 *      payment — the one error direction that misleads a buyer about affordability.
 *   2. We show the effective APR next to it, because a "3% loan" that really costs ~5.6%
 *      is the single most useful thing this card can tell someone.
 */

/** Local to this card by design: keeping it here avoids editing the working WhatIf slider. */
function Slider({
  label, min, max, step, value, onChange, format,
}: {
  label: string; min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className="tnum text-xs font-semibold">{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        aria-label={label}
        onChange={(e) => onChange(+e.target.value)}
        className="range-accent h-2 w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        style={{ background: `linear-gradient(to right, hsl(var(--accent)) ${pct}%, hsl(var(--surface-2)) ${pct}%)` }}
      />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className={`tnum text-sm ${strong ? "font-semibold text-fg" : "text-fg/85"}`}>{value}</span>
    </div>
  );
}

export function Financing({ result }: { result: ValuationResult }) {
  const price = result.valuation.price_mid_aed;

  const [downPct, setDownPct] = useState(UAE_MIN_DOWN_PAYMENT_PCT);
  const [months, setMonths] = useState(UAE_MAX_TENURE_MONTHS);
  const [flat, setFlat] = useState(3);

  const plan = useMemo(
    () => computeFinancing({ priceAed: price, downPaymentPct: downPct, tenureMonths: months, flatRatePct: flat }),
    [price, downPct, months, flat],
  );

  return (
    <SectionCard
      title="Monthly payment"
      subtitle="What this car costs to finance in the UAE"
      icon={<Landmark className="h-4.5 w-4.5" />}
      right={<Pill tone="muted">estimate</Pill>}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {/* controls */}
        <div className="space-y-4">
          <Slider
            label="Down payment" min={0} max={60} step={5} value={downPct}
            onChange={setDownPct} format={(v) => `${v}% · ${aed((price * v) / 100)}`}
          />
          <Slider
            label="Term" min={12} max={UAE_MAX_TENURE_MONTHS} step={12} value={months}
            onChange={setMonths} format={(v) => `${v} months`}
          />
          <Slider
            label="Bank's advertised (flat) rate" min={0} max={8} step={0.25} value={flat}
            onChange={setFlat} format={(v) => `${v.toFixed(2)}% / year`}
          />

          {plan.belowRegulatoryMinimum && (
            <p className="flex items-start gap-1.5 rounded-lg bg-warn/10 px-2.5 py-2 text-[11px] text-warn">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
              UAE lenders are capped at 80% of vehicle value, so most will require at least{" "}
              {UAE_MIN_DOWN_PAYMENT_PCT}% down.
            </p>
          )}
        </div>

        {/* result */}
        <div>
          <p className="text-xs text-muted">Estimated monthly</p>
          <p className="tnum text-3xl font-semibold tracking-tight text-accent">{aed(plan.monthlyAed)}</p>
          <p className="mt-0.5 text-[11px] text-muted">
            on {aed(plan.principalAed)} financed over {months} months
          </p>

          <div className="mt-4">
            <Row label="Car price (our estimate)" value={aed(price)} />
            <Row label="Down payment" value={aed(plan.downPaymentAed)} />
            <Row label="Amount financed" value={aed(plan.principalAed)} />
            <Row label="Total interest" value={aed(plan.totalInterestAed)} />
            <Row label="Total you repay" value={aed(plan.totalPayableAed)} strong />
          </div>
        </div>
      </div>

      {/* The point of the card: a flat quote is not the real cost of the money. */}
      {plan.effectiveAprPct !== null && plan.effectiveAprPct > 0 && (
        <div className="mt-5 rounded-xl border border-dashed bg-surface-2/30 p-3.5">
          <p className="text-sm text-fg/85">
            A <span className="tnum font-semibold">{flat.toFixed(2)}%</span> flat rate is really{" "}
            <span className="tnum font-semibold text-accent">{plan.effectiveAprPct.toFixed(1)}% APR</span>.
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            UAE banks advertise a <strong className="font-medium text-fg/80">flat</strong> rate: interest is
            charged on the full amount for the whole term, even as you pay it down. The APR is the same loan
            expressed the way a reducing-balance mortgage would be — it is the number to use when comparing
            offers.
          </p>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Indicative only — not a financing offer, and not advice. Your actual rate depends on the lender, your
        salary-transfer arrangement and credit profile, and banks add fees this estimate does not model.
        Confirm the numbers with the bank before you commit.
      </p>
    </SectionCard>
  );
}
