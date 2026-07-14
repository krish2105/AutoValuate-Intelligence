"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { GitCompareArrows, Plus, X, Loader2, ArrowLeft, Trophy } from "lucide-react";
import type { VehicleInput, Valuation } from "@/lib/types";
import { estimateValuation } from "@/lib/api";
import { parseVehicle } from "@/lib/parse-vehicle";
import { aed, km } from "@/lib/utils";
import { Logo, SectionCard, Pill } from "@/components/ui";
import { cn } from "@/lib/utils";

interface Car {
  id: number;
  desc: string;
  input: VehicleInput | null;
  val: Valuation | null;
  busy: boolean;
}

let nextId = 3;

const SAMPLES = [
  "2021 Toyota Corolla GCC 48k km automatic petrol sedan",
  "2019 Nissan Patrol GCC 120k km automatic petrol SUV",
];

function withDefaults(f: Partial<VehicleInput>): VehicleInput {
  return {
    make: f.make ?? "", model: f.model ?? "", year: f.year ?? 2019,
    kilometers: f.kilometers ?? 90000, bodyType: f.bodyType ?? "Sedan",
    transmissionType: f.transmissionType ?? "Automatic", fuelType: f.fuelType ?? "Petrol",
    regionalSpecs: f.regionalSpecs ?? "GCC", noOfCylinders: f.noOfCylinders ?? 4,
    city: f.city ?? "Dubai", sellerType: "Owner", photos: [],
  };
}

/**
 * M6 — compare garage (buyer mode).
 *
 * The product is seller-shaped by default ("what is MY car worth?"). A buyer has the
 * opposite question: given these three cars, which is the best value? We answer it with
 * the same model — asking price vs computed fair value — so "best value" means the biggest
 * gap below fair value, not the cheapest sticker.
 */
export default function ComparePage() {
  const [cars, setCars] = useState<Car[]>([
    { id: 1, desc: SAMPLES[0], input: null, val: null, busy: false },
    { id: 2, desc: SAMPLES[1], input: null, val: null, busy: false },
  ]);
  const [asking, setAsking] = useState<Record<number, string>>({});

  function update(id: number, patch: Partial<Car>) {
    setCars((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function valueAll() {
    for (const c of cars) {
      if (!c.desc.trim()) continue;
      update(c.id, { busy: true });
      const { matched, ...f } = parseVehicle(c.desc);
      const input = withDefaults(f);
      const val = await estimateValuation(input);
      update(c.id, { input, val, busy: false });
      await new Promise((r) => setTimeout(r, 300)); // free backend is rate-limited
    }
  }

  const valued = cars.filter((c) => c.val);

  // Best value = biggest gap between fair mid and the asking price (not the cheapest car).
  const scored = valued.map((c) => {
    const ask = Number((asking[c.id] || "").replace(/[^\d]/g, "")) || 0;
    const mid = c.val!.price_mid_aed;
    return { ...c, ask, mid, gap: ask > 0 ? mid - ask : null };
  });
  const withAsk = scored.filter((c) => c.gap !== null);
  const best = withAsk.length > 1 ? withAsk.reduce((a, b) => (b.gap! > a.gap! ? b : a)) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Logo />
        <Link href="/" className="inline-flex items-center gap-1.5 rounded-full border bg-surface/70 px-3 py-2 text-xs font-medium text-muted transition hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
      </header>

      <div className="mb-6">
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">Compare cars</h1>
        <p className="mt-1 text-sm text-muted">
          Buying, not selling? Put the cars side by side. Enter what each seller is asking and we&apos;ll tell you which
          is genuinely the best value — the biggest discount to fair value, not just the lowest price.
        </p>
      </div>

      <SectionCard title="Your shortlist" subtitle="Describe each car in plain English"
        icon={<GitCompareArrows className="h-4.5 w-4.5" />}
        right={<Pill tone="info">{cars.length} cars</Pill>}>
        <div className="space-y-2">
          {cars.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2">
              <input
                value={c.desc}
                onChange={(e) => update(c.id, { desc: e.target.value })}
                aria-label="Describe a car"
                placeholder="e.g. 2020 Honda Civic GCC 55k km sedan"
                className="min-w-0 flex-1 rounded-xl border bg-surface-2/60 px-3.5 py-2.5 text-sm outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/25 placeholder:text-muted/60"
              />
              <input
                value={asking[c.id] ?? ""}
                onChange={(e) => setAsking((p) => ({ ...p, [c.id]: e.target.value }))}
                aria-label="Asking price in AED"
                placeholder="Asking AED"
                inputMode="numeric"
                className="w-32 shrink-0 rounded-xl border bg-surface-2/60 px-3 py-2.5 text-sm outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/25 placeholder:text-muted/60"
              />
              {cars.length > 2 && (
                <button onClick={() => setCars((p) => p.filter((x) => x.id !== c.id))}
                  aria-label="Remove this car"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-bad/10 hover:text-bad">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {cars.length < 4 && (
            <button onClick={() => setCars((p) => [...p, { id: nextId++, desc: "", input: null, val: null, busy: false }])}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm text-muted transition hover:border-accent/40 hover:text-accent">
              <Plus className="h-4 w-4" /> Add a car
            </button>
          )}
          <button onClick={valueAll}
            disabled={cars.some((c) => c.busy)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:brightness-105 disabled:opacity-60">
            {cars.some((c) => c.busy) && <Loader2 className="h-4 w-4 animate-spin" />}
            Value all
          </button>
        </div>
      </SectionCard>

      {valued.length > 0 && (
        <div className="mt-5">
          <SectionCard title="Side by side" subtitle="Fair value from the same model that prices a single appraisal"
            icon={<Trophy className="h-4.5 w-4.5" />}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted">
                    <th className="pb-2 font-medium">Car</th>
                    <th className="pb-2 font-medium">Mileage</th>
                    <th className="pb-2 text-right font-medium">Fair value</th>
                    <th className="pb-2 text-right font-medium">Asking</th>
                    <th className="pb-2 text-right font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {scored.map((c) => {
                    const isBest = best?.id === c.id;
                    return (
                      <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className={cn("border-b last:border-0", isBest && "bg-good/6")}>
                        <td className="py-2.5 pr-3">
                          <span className="font-medium">
                            {c.input?.year} {c.input?.make} {c.input?.model}
                          </span>
                          {isBest && <Pill tone="good">best value</Pill>}
                        </td>
                        <td className="tnum py-2.5 pr-3 text-muted">{km(c.input?.kilometers ?? 0)}</td>
                        <td className="tnum py-2.5 text-right font-semibold text-accent">{aed(c.mid)}</td>
                        <td className="tnum py-2.5 text-right text-muted">{c.ask ? aed(c.ask) : "—"}</td>
                        <td className="tnum py-2.5 text-right">
                          {c.gap === null ? (
                            <span className="text-xs text-muted">add an asking price</span>
                          ) : c.gap >= 0 ? (
                            <span className="font-medium text-good">{aed(c.gap)} under</span>
                          ) : (
                            <span className="font-medium text-bad">{aed(Math.abs(c.gap))} over</span>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {best && (
              <div className="mt-4 rounded-xl border border-good/30 bg-good/8 px-3.5 py-3 text-sm leading-relaxed text-fg/90">
                <span className="font-semibold">
                  {best.input?.year} {best.input?.make} {best.input?.model}
                </span>{" "}
                is the best value: it&apos;s priced <span className="tnum font-semibold text-good">{aed(best.gap!)}</span>{" "}
                below what the model says it&apos;s worth. Cheapest sticker isn&apos;t the same as best value — this is the
                biggest discount to fair value.
              </div>
            )}

            <p className="mt-3 text-[11px] text-muted">
              Fair value comes from the pricing model only (no photo scan). Open a full appraisal on any car for its
              damage scan, comparables and explanation.
            </p>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
