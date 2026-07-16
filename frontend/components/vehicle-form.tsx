"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImagePlus, X, Sparkles, Loader2, Wand2 } from "lucide-react";
import type { VehicleInput } from "@/lib/types";
import type { ClientCondition } from "@/lib/cv-browser";
import { parseVehicle } from "@/lib/parse-vehicle";
import { cn } from "@/lib/utils";
import { BrowserCV } from "./browser-cv";
import { GuidedCapture } from "./guided-capture";

const BODY = ["SUV", "Sedan", "Coupe", "Hatchback", "Pick Up Truck", "Van", "Convertible", "Wagon"];
const SPECS = ["GCC", "American", "European", "Japanese", "Canadian", "Korean", "Chinese", "Other"];
const FUEL = ["Petrol", "Diesel", "Hybrid", "Electric"];
const TRANS = ["Automatic", "Manual"];
const CITY = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Al Ain", "Fujairah"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border bg-surface-2/60 px-3.5 py-2.5 text-sm outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/25 placeholder:text-muted/60";

export function VehicleForm({ onSubmit, loading, preset }: { onSubmit: (v: VehicleInput) => void; loading: boolean; preset?: VehicleInput | null }) {
  const [v, setV] = useState<VehicleInput>({
    make: "", model: "", year: 2019, kilometers: 90000,
    bodyType: "Sedan", transmissionType: "Automatic", fuelType: "Petrol",
    regionalSpecs: "GCC", noOfCylinders: 4, city: "Dubai", sellerType: "Owner", photos: [],
  });
  const [photos, setPhotos] = useState<string[]>([]);
  // Aligned with `photos` for guided captures ("front", "rear-left", …); undefined for
  // quick uploads, whose photos carry no trustworthy position information.
  const [photoAngles, setPhotoAngles] = useState<string[] | undefined>(undefined);
  const [clientCondition, setClientCondition] = useState<ClientCondition | null>(null);
  const [drag, setDrag] = useState(false);
  const [mode, setMode] = useState<"quick" | "guided">("quick");
  const [desc, setDesc] = useState("");
  const [parsed, setParsed] = useState<string[]>([]);

  /** M7: parse a plain-English description into the structured form (deterministic, offline). */
  function applyDescription() {
    const { matched, ...fields } = parseVehicle(desc);
    if (!matched.length) { setParsed([]); return; }
    setV((p) => ({ ...p, ...fields }));
    setParsed(matched);
  }
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof VehicleInput, val: any) => setV((p) => ({ ...p, [k]: val }));

  // Fill the form when a demo-garage preset is chosen (photos stay empty — samples
  // carry a synthetic client_condition instead, applied by the page's run()).
  useEffect(() => {
    if (!preset) return;
    const { photos: _p, client_condition: _c, ...rest } = preset;
    setV((p) => ({ ...p, ...rest }));
    setPhotos([]);
    setClientCondition(preset.client_condition ?? null);
  }, [preset]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).slice(0, 8 - photos.length).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => setPhotos((p) => (p.length < 8 ? [...p, reader.result as string] : p));
      reader.readAsDataURL(f);
    });
  }

  const valid = v.make.trim() && v.model.trim() && v.year && v.kilometers >= 0;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit({ ...v, photos, client_condition: clientCondition }); }}
      className="space-y-5"
    >
      {/* M7 — describe your car in plain English */}
      <div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Wand2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyDescription(); } }}
              aria-label="Describe your car in plain English"
              placeholder="Describe it: “2019 Toyota Corolla GCC, 90k km, automatic petrol sedan”"
              className={cn(inputCls, "pl-9")}
            />
          </div>
          <button
            type="button"
            onClick={applyDescription}
            disabled={!desc.trim()}
            className="shrink-0 rounded-xl border px-3 py-2.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-accent disabled:opacity-50"
          >
            Fill form
          </button>
        </div>
        <AnimatePresence>
          {parsed.length > 0 && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-1.5 text-xs text-good">
              Filled {parsed.join(", ")} — check the fields below and adjust anything I got wrong.
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* capture mode switch */}
      <div className="flex items-center gap-1 rounded-xl border bg-surface-2/40 p-1" role="tablist" aria-label="Photo capture mode">
        {([["quick", "Quick upload"], ["guided", "Guided walk-around"]] as const).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => { setMode(m); setPhotos([]); setPhotoAngles(undefined); setClientCondition(null); }}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              mode === m ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "guided" ? (
        <GuidedCapture onPhotos={(p, a) => { setPhotos(p); setPhotoAngles(a); }} />
      ) : (
      /* photo dropzone */
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload car photos — drop files here or press Enter to browse"
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
        className={cn(
          "focus:outline-none focus:ring-2 focus:ring-accent/50",
          "group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition",
          drag ? "border-accent bg-accent/8" : "hairline hover:border-accent/50 hover:bg-surface-2/50"
        )}
      >
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        <div className="grid h-11 w-11 place-items-center rounded-full bg-accent/12 text-accent transition group-hover:scale-105">
          <ImagePlus className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium">Drop car photos or tap to upload</p>
          <p className="text-xs text-muted">Up to 8 images · scanned for damage on-device, in your browser</p>
        </div>
      </div>
      )}

      <AnimatePresence>
        {mode === "quick" && photos.length > 0 && (
          <motion.div layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-2">
            {photos.map((src, i) => (
              <motion.div key={i} layout initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="relative h-16 w-16 overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`car ${i + 1}`} className="h-full w-full object-cover" />
                <button type="button" onClick={(e) => { e.stopPropagation(); setPhotos((p) => p.filter((_, j) => j !== i)); }}
                  className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white">
                  <X className="h-3 w-3" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* on-device damage scan (browser WASM) */}
      <BrowserCV photos={photos} angles={photoAngles} onCondition={setClientCondition} />

      {/* details grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Make"><input className={inputCls} placeholder="Toyota" value={v.make} onChange={(e) => set("make", e.target.value)} /></Field>
        <Field label="Model"><input className={inputCls} placeholder="Corolla" value={v.model} onChange={(e) => set("model", e.target.value)} /></Field>
        <Field label="Year"><input type="number" min={1980} max={2026} className={cn(inputCls, "tnum")} value={v.year} onChange={(e) => set("year", +e.target.value)} /></Field>
        <Field label="Mileage (km)"><input type="number" min={0} className={cn(inputCls, "tnum")} value={v.kilometers} onChange={(e) => set("kilometers", +e.target.value)} /></Field>
        <Field label="Cylinders"><input type="number" min={2} max={16} className={cn(inputCls, "tnum")} value={v.noOfCylinders ?? ""} onChange={(e) => set("noOfCylinders", e.target.value ? +e.target.value : null)} /></Field>
        <Field label="Body type"><select className={inputCls} value={v.bodyType} onChange={(e) => set("bodyType", e.target.value)}>{BODY.map((b) => <option key={b}>{b}</option>)}</select></Field>
        <Field label="Regional specs"><select className={inputCls} value={v.regionalSpecs} onChange={(e) => set("regionalSpecs", e.target.value)}>{SPECS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Transmission"><select className={inputCls} value={v.transmissionType} onChange={(e) => set("transmissionType", e.target.value)}>{TRANS.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Fuel"><select className={inputCls} value={v.fuelType} onChange={(e) => set("fuelType", e.target.value)}>{FUEL.map((f) => <option key={f}>{f}</option>)}</select></Field>
        <Field label="City"><select className={inputCls} value={v.city} onChange={(e) => set("city", e.target.value)}>{CITY.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Seller"><select className={inputCls} value={v.sellerType} onChange={(e) => set("sellerType", e.target.value)}><option>Owner</option><option>Dealer</option></select></Field>
        {/* Optional and never sent to the model (lib/api.ts:toApiVehicle) — it only scores the
            deal locally. An anchored "independent" valuation would be worth nothing. */}
        <Field label="Asking price (optional)">
          <input type="number" min={0} max={5_000_000} inputMode="numeric" placeholder="e.g. 48,000"
            aria-describedby="asking-price-help"
            className={cn(inputCls, "tnum")}
            value={v.asking_price_aed ?? ""}
            onChange={(e) => set("asking_price_aed", e.target.value ? +e.target.value : null)} />
        </Field>
      </div>

      <p id="asking-price-help" className="-mt-1 text-xs text-muted">
        Asking price is optional and stays in your browser — it scores the deal, and is never
        given to the model, which would only teach it to agree with the seller.
      </p>

      <motion.button
        type="submit" disabled={!valid || loading}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold transition",
          valid && !loading ? "bg-accent text-accent-fg shadow-glow hover:brightness-105" : "cursor-not-allowed bg-surface-2 text-muted"
        )}
      >
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</> : <><Sparkles className="h-4 w-4" /> Value my car</>}
      </motion.button>
      {/* say WHY the button is disabled — a grey button with no reason reads as broken,
          especially after a photo scan has already succeeded */}
      {!valid && !loading && (
        <p className="-mt-2 text-center text-[11px] text-muted" aria-live="polite">
          Enter the <span className="font-medium text-fg">make</span> and <span className="font-medium text-fg">model</span> to enable the valuation.
        </p>
      )}
    </form>
  );
}
