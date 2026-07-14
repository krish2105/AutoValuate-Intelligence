"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Upload, Download, Loader2, ArrowLeft, Table2, AlertTriangle } from "lucide-react";
import type { VehicleInput } from "@/lib/types";
import { estimateValuation } from "@/lib/api";
import { parseVehicle } from "@/lib/parse-vehicle";
import { aed, km } from "@/lib/utils";
import { Logo, SectionCard, Pill } from "@/components/ui";

interface Row {
  input: VehicleInput;
  raw: string;
  low?: number;
  mid?: number;
  high?: number;
  status: "pending" | "done" | "failed";
}

const TEMPLATE = `make,model,year,kilometers,bodyType,noOfCylinders,city
Toyota,Land Cruiser,2019,90000,SUV,6,Dubai
Nissan,Patrol,2021,45000,SUV,8,Abu Dhabi
Honda,Civic,2018,120000,Sedan,4,Sharjah`;

/** Parse a CSV with a header row into vehicle inputs. Falls back to free-text per line. */
function parseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const header = lines[0].toLowerCase();
  const hasHeader = /make/.test(header) && /model/.test(header);
  const cols = hasHeader ? lines[0].split(",").map((c) => c.trim().toLowerCase()) : [];
  const body = hasHeader ? lines.slice(1) : lines;

  return body.map((line) => {
    const raw = line.trim();
    if (!hasHeader) {
      // tolerate a plain list of descriptions — reuse the M7 parser
      const { matched, ...f } = parseVehicle(raw);
      return { raw, status: "pending" as const, input: withDefaults(f) };
    }
    const cells = raw.split(",").map((c) => c.trim());
    const get = (k: string) => {
      const i = cols.indexOf(k);
      return i >= 0 ? cells[i] : "";
    };
    return {
      raw,
      status: "pending" as const,
      input: withDefaults({
        make: get("make"),
        model: get("model"),
        year: Number(get("year")) || undefined,
        kilometers: Number(get("kilometers") || get("km")) || undefined,
        bodyType: get("bodytype") || undefined,
        noOfCylinders: Number(get("noofcylinders") || get("cylinders")) || undefined,
        city: get("city") || undefined,
      }),
    };
  }).filter((r) => r.input.make && r.input.model);
}

function withDefaults(f: Partial<VehicleInput>): VehicleInput {
  return {
    make: f.make ?? "", model: f.model ?? "",
    year: f.year ?? 2019, kilometers: f.kilometers ?? 90000,
    bodyType: f.bodyType ?? "Sedan", transmissionType: f.transmissionType ?? "Automatic",
    fuelType: f.fuelType ?? "Petrol", regionalSpecs: f.regionalSpecs ?? "GCC",
    noOfCylinders: f.noOfCylinders ?? 4, city: f.city ?? "Dubai",
    sellerType: "Dealer", photos: [],
  };
}

export default function DealerPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function load(text: string) {
    setRows(parseCsv(text));
    setDone(0);
  }

  async function valueAll() {
    if (busy || !rows.length) return;
    setBusy(true);
    setDone(0);

    // Sequential with a small gap: the free backend is rate-limited, and hammering it
    // would trip the limiter and fail the whole batch. Progress updates as each lands.
    const next = [...rows];
    for (let i = 0; i < next.length; i++) {
      const v = await estimateValuation(next[i].input);
      next[i] = v
        ? { ...next[i], low: v.price_low_aed, mid: v.price_mid_aed, high: v.price_high_aed, status: "done" }
        : { ...next[i], status: "failed" };
      setRows([...next]);
      setDone(i + 1);
      await new Promise((r) => setTimeout(r, 350));
    }
    setBusy(false);
  }

  function exportCsv() {
    const head = "make,model,year,kilometers,low_aed,mid_aed,high_aed,status";
    const body = rows.map((r) =>
      [r.input.make, r.input.model, r.input.year, r.input.kilometers,
       r.low ? Math.round(r.low) : "", r.mid ? Math.round(r.mid) : "", r.high ? Math.round(r.high) : "",
       r.status].join(","),
    );
    const blob = new Blob([[head, ...body].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "autovaluate_fleet.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const valued = rows.filter((r) => r.status === "done");
  const total = valued.reduce((s, r) => s + (r.mid ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6">
      <header className="mb-8 flex items-center justify-between gap-3">
        <Logo />
        <Link href="/" className="inline-flex items-center gap-1.5 rounded-full border bg-surface/70 px-3 py-2 text-xs font-medium text-muted transition hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
      </header>

      <div className="mb-6">
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">Fleet valuation</h1>
        <p className="mt-1 text-sm text-muted">
          Upload a CSV of your inventory and value every car at once. Runs the same pricing model as a single appraisal.
        </p>
      </div>

      <SectionCard title="Your inventory" subtitle="CSV with a make,model,year,kilometers header — or one description per line"
        icon={<Table2 className="h-4.5 w-4.5" />}
        right={rows.length ? <Pill tone="info">{rows.length} vehicles</Pill> : undefined}>
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => load(String(reader.result));
            reader.readAsText(f);
          }} />

        <div className="flex flex-wrap gap-2">
          <button onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition hover:border-accent/40 hover:text-accent">
            <Upload className="h-4 w-4" /> Upload CSV
          </button>
          <button onClick={() => load(TEMPLATE)}
            className="rounded-xl border px-3 py-2 text-sm text-muted transition hover:text-fg">
            Load a sample fleet
          </button>
          {rows.length > 0 && (
            <button onClick={valueAll} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:brightness-105 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? `Valuing ${done}/${rows.length}…` : `Value all ${rows.length}`}
            </button>
          )}
          {valued.length > 0 && !busy && (
            <button onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm text-muted transition hover:border-accent/40 hover:text-accent">
              <Download className="h-4 w-4" /> Export CSV
            </button>
          )}
        </div>

        {valued.length > 0 && (
          <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-2 rounded-xl border bg-surface-2/40 px-4 py-3">
            <div>
              <p className="text-xs text-muted">Fleet value (mid)</p>
              <p className="tnum text-xl font-semibold text-accent">{aed(total)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Valued</p>
              <p className="tnum text-sm font-medium">{valued.length} of {rows.length}</p>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted">
                  <th className="pb-2 font-medium">Vehicle</th>
                  <th className="pb-2 font-medium">Mileage</th>
                  <th className="pb-2 text-right font-medium">Low</th>
                  <th className="pb-2 text-right font-medium">Mid</th>
                  <th className="pb-2 text-right font-medium">High</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="border-b last:border-0">
                    <td className="py-2.5 pr-3">
                      <span className="font-medium">{r.input.year} {r.input.make} {r.input.model}</span>
                    </td>
                    <td className="tnum py-2.5 pr-3 text-muted">{km(r.input.kilometers)}</td>
                    {r.status === "done" ? (
                      <>
                        <td className="tnum py-2.5 text-right text-muted">{aed(r.low!)}</td>
                        <td className="tnum py-2.5 text-right font-semibold text-accent">{aed(r.mid!)}</td>
                        <td className="tnum py-2.5 text-right text-muted">{aed(r.high!)}</td>
                      </>
                    ) : r.status === "failed" ? (
                      <td colSpan={3} className="py-2.5 text-right">
                        <span className="inline-flex items-center gap-1 text-xs text-warn">
                          <AlertTriangle className="h-3 w-3" /> could not value
                        </span>
                      </td>
                    ) : (
                      <td colSpan={3} className="py-2.5 text-right text-xs text-muted">pending</td>
                    )}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <p className="mt-6 text-xs text-muted">
        Bulk valuations run the pricing model only (no photo scan, no written report), so they are fast — open a single
        appraisal for the full explainable breakdown of any vehicle.
      </p>
    </div>
  );
}
