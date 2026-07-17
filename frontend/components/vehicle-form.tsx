"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImagePlus, X, Sparkles, Loader2, Wand2 } from "lucide-react";
import type { VehicleInput } from "@/lib/types";
import type { ClientCondition } from "@/lib/cv-browser";
import { useScanJob, conditionBlockReason } from "@/lib/cv/scan-job";
import { parseVehicle } from "@/lib/parse-vehicle";
import { cn } from "@/lib/utils";
import { BrowserCV } from "./browser-cv";
import { GuidedCapture } from "./guided-capture";

/** Mirrors the backend's MAX_PHOTOS (backend-api/main.py). */
const MAX_PHOTOS = 8;

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
  /**
   * Demo-garage presets carry a synthetic condition and no photos. Kept separate from the
   * scan job so a preset can never be mistaken for the output of a real scan.
   */
  const [presetCondition, setPresetCondition] = useState<ClientCondition | null>(null);
  /** Explicit user consent to be valued on an incomplete scan. Reset with every photo change. */
  const [acceptedPartial, setAcceptedPartial] = useState(false);
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
    setPresetCondition(preset.client_condition ?? null);
    setAcceptedPartial(false);
  }, [preset]);

  // Any change to the photo set retracts consent given for a previous set's partial scan —
  // otherwise one "continue anyway" would silently apply to every later scan.
  useEffect(() => { setAcceptedPartial(false); }, [photos]);

  /**
   * Read files and append them IN THE ORDER THE USER PICKED THEM.
   *
   * The previous version started one FileReader per file and appended from each `onload`.
   * Completion order is not selection order (a small file beats a large one), so the photo
   * strip could silently reorder — and since the condition reports per-photo indices
   * ("damage in photo 2"), the report could point at the wrong photo. It also read
   * `photos.length` from the render closure while the appending guard read live state, so
   * two quick picks could exceed the cap or drop files.
   *
   * Awaiting all reads, then appending once, makes order independent of decode timing and
   * makes the cap a single check against live state.
   */
  async function addFiles(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files);
    const read = (f: File) =>
      new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        // An unreadable file is dropped rather than appended as `undefined`, which would
        // later throw in the hasher and fail the whole scan.
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(f);
      });
    const results = (await Promise.all(picked.map(read))).filter((s): s is string => !!s);
    setPhotos((p) => [...p, ...results].slice(0, MAX_PHOTOS));
  }

  const valid = v.make.trim() && v.model.trim() && v.year && v.kilometers >= 0;

  // Single source of truth for the scan. Derived from `photos`, so it can never describe
  // a stale set — see lib/cv/scan-job.ts.
  const job = useScanJob(photos);
  const blockReason = conditionBlockReason(job, photos, acceptedPartial);
  const canSubmit = !!valid && !loading && !blockReason;

  /**
   * The condition to send. For demo-garage presets there are no photos, so the preset's
   * synthetic condition stands in; otherwise it comes from the live job and only when the
   * job matches the current photos.
   */
  const outgoingCondition = photos.length === 0 ? presetCondition : job.condition;

  function submit() {
    if (!canSubmit) return;
    // Belt and braces: assert the binding right before the wire. `blockReason` should have
    // caught any mismatch, but this is the last point where sending the wrong photo set's
    // damage result is still preventable, and it silently changes the price.
    if (outgoingCondition && photos.length > 0) {
      if (outgoingCondition.photo_set_hash !== job.photoSetHash) return;
      if (outgoingCondition.model_version !== job.modelVersion) return;
      if (outgoingCondition.status !== "complete" && !acceptedPartial) return;
    }
    onSubmit({ ...v, photos, client_condition: outgoingCondition });
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
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
            onClick={() => { setMode(m); setPhotos([]); setPresetCondition(null); }}
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
        <GuidedCapture onPhotos={setPhotos} />
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
      <BrowserCV job={job} />

      {/*
        "Continue without visual assessment" — the ONLY way to be valued on an incomplete
        scan. Submitting a stale or partial condition silently used to be the default;
        now skipping the assessment is a deliberate, visible choice.
      */}
      {photos.length > 0 && (job.status === "partial" || job.status === "failed") && (
        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-warn/40 bg-warn/5 p-3 text-[11px]">
          <input
            type="checkbox"
            checked={acceptedPartial}
            onChange={(e) => setAcceptedPartial(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Continue without a complete visual assessment.</span>{" "}
            <span className="text-muted">
              {job.status === "failed"
                ? "No photo could be scanned, so the valuation will assume market-typical condition."
                : "Some photos could not be scanned, so damage in them is not reflected in the price."}
            </span>
          </span>
        </label>
      )}

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

      {/*
        Submission is blocked while a scan for the current photos is non-terminal. This is
        the policy that stops an in-flight scan's photos being priced with the PREVIOUS
        set's damage result — previously `disabled` knew nothing about the scan at all, so
        submitting mid-scan silently shipped a stale condition and a wrong price.
      */}
      <motion.button
        type="submit" disabled={!canSubmit}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold transition",
          canSubmit ? "bg-accent text-accent-fg shadow-glow hover:brightness-105" : "cursor-not-allowed bg-surface-2 text-muted"
        )}
      >
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</> : <><Sparkles className="h-4 w-4" /> Value my car</>}
      </motion.button>
      {/* say WHY the button is disabled — a grey button with no reason reads as broken,
          especially after a photo scan has already succeeded */}
      {!loading && (!valid || blockReason) && (
        <p className="-mt-2 text-center text-[11px] text-muted" aria-live="polite">
          {!valid ? (
            <>Enter the <span className="font-medium text-fg">make</span> and <span className="font-medium text-fg">model</span> to enable the valuation.</>
          ) : (
            <>Waiting — {blockReason}.</>
          )}
        </p>
      )}
    </form>
  );
}
