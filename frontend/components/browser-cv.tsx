"use client";
import { motion, AnimatePresence } from "framer-motion";
import { ScanSearch, Loader2, ShieldCheck, Cpu, AlertTriangle } from "lucide-react";
import { classColor, DAMAGE_INFO } from "@/lib/cv-browser";
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
  // A scan that found NOTHING is unverified, not good news — the detector misses ~a third of
  // real damage, so it must not render in confident green with a shield. Any car with at least
  // one finding is scored normally; only the zero-detection case is de-confidenced.
  const foundNothing = status === "complete" && totalFindings === 0;
  const scoreTone = score == null ? "muted"
    : foundNothing ? "muted"
      : score >= 78 ? "good" : score >= 60 ? "warn" : "bad";
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
            {score != null && score >= 78 && !foundNothing ? <ShieldCheck className="h-3 w-3" /> : null}
            {foundNothing
              ? "no damage detected · unconfirmed"
              : `${score}/100 · ${totalFindings} issue${totalFindings === 1 ? "" : "s"}`}
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
          <div key={`${p.hash || "pending"}-${i}`} className="relative inline-flex min-h-24 min-w-24 overflow-hidden rounded-xl border bg-black/20">
            {/*
              This inner wrapper shrink-wraps the rendered image, so the overlay's
              percentages are percentages OF THE IMAGE. Previously the boxes were
              positioned against the square container while the img used `object-cover`,
              which centre-crops — so every box was offset and mis-scaled for any photo
              that wasn't exactly 1:1 (i.e. essentially every phone photo).
            */}
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {/* Large enough that the detection overlays are actually legible. Height-capped and
                  width-auto so the box hugs the photo's real aspect ratio (no grey letterboxing);
                  max-w-full keeps a very wide panorama inside the card. The overlays below are
                  percentages OF THIS IMAGE, so they scale exactly as the image grows. */}
              <img src={p.src} alt={`scan ${i + 1}`} className="block h-auto max-h-56 w-auto max-w-full object-contain sm:max-h-72" />
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

      {/* per-class findings — each with a plain-language explanation so a buyer or seller
          understands what was found, what it means for the price, and how it's fixed. */}
      {cond && cond.findings.length > 0 && (
        <ul className="mt-3 space-y-2">
          {cond.findings.map((f) => {
            const info = DAMAGE_INFO[f.damage_type];
            return (
              <li key={f.damage_type} className="rounded-xl border bg-surface/60 p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: classColor(f.damage_type) }} />
                  <span className="font-semibold">{titleCase(f.damage_type.replace("_", " "))}</span>
                  <span className={`font-medium ${sevTone[f.severity] ?? "text-muted"}`}>{f.severity}</span>
                  <span className="text-muted">×{f.instances} {f.instances === 1 ? "spot" : "spots"}</span>
                  <span className="ml-auto flex items-center gap-1 text-muted">
                    lowers value by <span className="tnum font-semibold text-bad">−{f.value_impact_pct}%</span>
                  </span>
                </div>
                {info && (
                  <div className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-muted">
                    <p><span className="text-fg/80">{info.what}</span> {info.note(f.severity)}</p>
                    <p><span className="font-medium text-fg/70">What it means:</span> {info.impact}</p>
                    <p><span className="font-medium text-fg/70">Typical fix:</span> {info.repair}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {/* how to read the score — brief, honest framing for a non-expert */}
      {cond && cond.findings.length > 0 && (
        <p className="mt-2 text-[11px] text-muted">
          The score starts at 100 and each issue lowers it by how much that damage typically
          costs the car&apos;s value. It&apos;s a photo-based guide for negotiation — not a
          substitute for a physical inspection.
        </p>
      )}
      {/* A zero-detection scan is NOT a clean bill of health. The detector's measured recall is
          0.690 overall (dent 0.525, crack 0.389) — it misses roughly a third of real damage — so
          "found nothing" cannot support "the car is clean". It previously rendered in confident
          green as "condition looks clean" at 100/100, which is the single most damaging thing
          this UI could say about a car it failed to read. Absence of evidence, stated as such. */}
      {cond && cond.findings.length === 0 && status === "complete" && (
        <div className="mt-3 rounded-xl border border-warn/30 bg-warn/5 p-3">
          <p className="flex items-start gap-1.5 text-[11px] font-medium text-warn">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            No damage was detected — but that is not the same as no damage.
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            This detector finds about <span className="text-fg/80">two-thirds</span> of real damage,
            so a clean scan is <span className="text-fg/80">unconfirmed, not proof</span>. It is
            weakest on dents and fine cracks, and on wide shots where damage is small in frame.
            Photograph each panel close-up, and treat this result as a starting point for an
            inspection rather than a verdict.
          </p>
        </div>
      )}
    </motion.div>
  );
}
