"use client";
import { motion, AnimatePresence } from "framer-motion";
import { ScanSearch, Loader2, ShieldCheck, Cpu, AlertTriangle } from "lucide-react";
import { classColor } from "@/lib/cv-browser";
import { isTerminal, type ScanJob } from "@/lib/cv/scan-job";
import { titleCase } from "@/lib/utils";
import { Pill } from "./ui";

/**
 * Presentational view of an on-device scan. All state lives in the ScanJob
 * (lib/cv/scan-job.ts), owned by the form — the component that gates submit must be able
 * to see whether a scan is finished, which it could not when this status was local here.
 *
 * Photos never leave the device: the scan runs in this tab and only the derived
 * ClientCondition is sent (see lib/api.toBackendRequest).
 */
export function BrowserCV({ job }: { job: ScanJob }) {
  const { status, photos, detections, condition: cond, errors } = job;
  if (photos.length === 0) return null;

  const busy = !isTerminal(status);
  const totalFindings = cond?.findings.length ?? 0;
  const score = cond?.condition_score ?? null;
  const scoreTone = score == null ? "muted" : score >= 78 ? "good" : score >= 60 ? "warn" : "bad";
  const sevTone: Record<string, string> = { minor: "text-muted", moderate: "text-warn", severe: "text-bad" };

  const busyLabel =
    status === "hashing" ? "reading photos…"
      : status === "loading-model" ? "loading model…"
        : status === "decoding" ? "decoding…"
          : "scanning…";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border bg-surface-2/40 p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/12 text-accent">
            <ScanSearch className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-semibold">On-device damage scan</p>
            <p className="text-[10px] text-muted flex items-center gap-1">
              <Cpu className="h-2.5 w-2.5" /> runs in your browser · photos never uploaded
            </p>
          </div>
        </div>
        {busy ? (
          <Pill tone="info" aria-live="polite"><Loader2 className="h-3 w-3 animate-spin" /> {busyLabel}</Pill>
        ) : status === "complete" ? (
          <Pill tone={scoreTone as any}>
            {score != null && score >= 78 ? <ShieldCheck className="h-3 w-3" /> : null}
            {score}/100 · {totalFindings} issue{totalFindings === 1 ? "" : "s"}
          </Pill>
        ) : status === "partial" ? (
          <Pill tone="warn"><AlertTriangle className="h-3 w-3" /> partial scan</Pill>
        ) : status === "failed" ? (
          <Pill tone="warn"><AlertTriangle className="h-3 w-3" /> scan unavailable</Pill>
        ) : null}
      </div>

      {/* Failures are surfaced, never swallowed — a photo we couldn't read is not a clean photo. */}
      {status === "failed" && (
        <p className="mb-2 text-[11px] text-muted">
          {errors[0]?.message || "the on-device scan failed"}. No visual assessment is available —
          continue only if you accept a valuation that assumes market-typical condition.
        </p>
      )}
      {status === "partial" && (
        <p className="mb-2 text-[11px] text-warn">
          {errors.length} of {photos.length} photo{photos.length === 1 ? "" : "s"} could not be scanned.
          The score below covers only the {cond?.photos_assessed} that were.
        </p>
      )}

      {/* photo thumbnails with detection overlays */}
      <div className="flex flex-wrap gap-2">
        {photos.map((p, i) => (
          // Keyed by content hash, not index: with index keys, removing photo 0 renumbers
          // every photo and React reuses the old node — old boxes over a different car.
          <div key={`${p.hash || "pending"}-${i}`} className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-xl border bg-black/20">
            {/*
              This inner wrapper shrink-wraps the rendered image, so the overlay's
              percentages are percentages OF THE IMAGE. Previously the boxes were
              positioned against the square container while the img used `object-cover`,
              which centre-crops — so every box was offset and mis-scaled for any photo
              that wasn't exactly 1:1 (i.e. essentially every phone photo).
            */}
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt={`scan ${i + 1}`} className="block max-h-24 max-w-24 object-contain" />
              <AnimatePresence>
                {(detections[i] ?? []).map((d, j) => (
                  <motion.div
                    key={j} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    title={`${titleCase(d.label.replace("_", " "))} · ${Math.round(d.confidence * 100)}%`}
                    className="absolute rounded-[3px]"
                    style={{
                      left: `${d.box[0] * 100}%`, top: `${d.box[1] * 100}%`,
                      width: `${(d.box[2] - d.box[0]) * 100}%`, height: `${(d.box[3] - d.box[1]) * 100}%`,
                      border: `2px solid ${classColor(d.label)}`,
                      boxShadow: `0 0 0 1px hsl(var(--bg) / 0.5) inset`,
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>
            {busy && !p.assessed && (
              <div className="absolute inset-0 grid place-items-center bg-black/25">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              </div>
            )}
            {isTerminal(status) && !p.assessed && (
              <div className="absolute inset-0 grid place-items-center bg-black/45" title="could not be scanned">
                <AlertTriangle className="h-4 w-4 text-warn" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* overall condition band + honest inspection prompt when damage is significant */}
      {cond && cond.findings.length > 0 && (
        <div className="mt-3">
          <p className={`text-xs font-medium ${scoreTone === "good" ? "text-good" : scoreTone === "warn" ? "text-warn" : "text-bad"}`}>
            {cond.assessment}
          </p>
          {cond.needs_inspection && (
            <p className="mt-1 flex items-start gap-1.5 text-[11px] text-muted">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-warn" />
              Significant or structural damage detected — a professional inspection is recommended.
              A photo scan can miss frame, mechanical and underbody damage.
            </p>
          )}
        </div>
      )}

      {/* per-class findings chips */}
      {cond && cond.findings.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {cond.findings.map((f) => (
            <span key={f.damage_type}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11px]">
              <span className="h-2 w-2 rounded-full" style={{ background: classColor(f.damage_type) }} />
              <span className="font-medium">{titleCase(f.damage_type.replace("_", " "))}</span>
              <span className={sevTone[f.severity] ?? "text-muted"}>{f.severity}</span>
              <span className="text-muted">×{f.instances}</span>
              <span className="text-bad tnum">−{f.value_impact_pct}%</span>
            </span>
          ))}
        </div>
      )}
      {/* Only a COMPLETE scan may claim a clean car. A partial or failed scan saying
          "no visible damage" would be asserting something it did not look at. */}
      {cond && cond.findings.length === 0 && status === "complete" && (
        <p className="mt-3 text-[11px] text-good">
          No visible damage detected in these photos — condition looks clean.
          <span className="text-muted"> A photo scan can’t assess frame, mechanical or service history.</span>
        </p>
      )}
    </motion.div>
  );
}
