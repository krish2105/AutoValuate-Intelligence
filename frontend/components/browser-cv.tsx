"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ScanSearch, Loader2, ShieldCheck, Cpu, AlertTriangle } from "lucide-react";
import {
  detectImage, loadImageEl, conditionFromDetections, classColor,
  type Detection, type ClientCondition,
} from "@/lib/cv-browser";
import { titleCase } from "@/lib/utils";
import { Pill } from "./ui";

type Status = "idle" | "loading" | "scanning" | "done" | "error";

/**
 * On-device (WASM) damage scan. Runs the trained YOLOv8 in the browser as soon as
 * photos are added, overlays boxes, and reports a condition score. Photos never
 * leave the device. Emits a ClientCondition upward so the valuation is condition-
 * adjusted (see lib/cv-browser.conditionFromDetections + backend client_condition).
 */
export function BrowserCV({
  photos, onCondition,
}: { photos: string[]; onCondition: (c: ClientCondition | null) => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [dets, setDets] = useState<Detection[][]>([]);
  const [cond, setCond] = useState<ClientCondition | null>(null);
  const [errMsg, setErrMsg] = useState<string>("");
  const runId = useRef(0);

  useEffect(() => {
    if (photos.length === 0) {
      setStatus("idle"); setDets([]); setCond(null); onCondition(null);
      return;
    }
    const myRun = ++runId.current;
    let cancelled = false;

    (async () => {
      try {
        setStatus("loading");
        const perPhoto: Detection[][] = [];
        setStatus("scanning");
        for (const src of photos) {
          if (cancelled || myRun !== runId.current) return;
          try {
            const img = await loadImageEl(src);
            const d = await detectImage(img);
            perPhoto.push(d);
          } catch {
            perPhoto.push([]); // a single bad image shouldn't kill the batch
          }
          if (cancelled || myRun !== runId.current) return;
          setDets([...perPhoto]);
          // yield to the event loop so the UI stays responsive between images
          await new Promise((r) => setTimeout(r, 0));
        }
        if (cancelled || myRun !== runId.current) return;
        const c = conditionFromDetections(perPhoto);
        setCond(c);
        onCondition(c);
        setStatus("done");
      } catch (e: any) {
        if (cancelled || myRun !== runId.current) return;
        setErrMsg(e?.message || "the on-device model failed to load");
        setStatus("error");
        onCondition(null);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  if (photos.length === 0) return null;

  const totalFindings = cond?.findings.length ?? 0;
  const score = cond?.condition_score ?? null;
  const scoreTone = score == null ? "muted" : score >= 80 ? "good" : score >= 55 ? "warn" : "bad";

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
              <Cpu className="h-2.5 w-2.5" /> runs in your browser · photos never uploaded for scanning
            </p>
          </div>
        </div>
        {status === "scanning" || status === "loading" ? (
          <Pill tone="info"><Loader2 className="h-3 w-3 animate-spin" /> scanning…</Pill>
        ) : status === "done" ? (
          <Pill tone={scoreTone as any}>
            {score != null && score >= 80 ? <ShieldCheck className="h-3 w-3" /> : null}
            {score}/100 · {totalFindings} issue{totalFindings === 1 ? "" : "s"}
          </Pill>
        ) : status === "error" ? (
          <Pill tone="warn"><AlertTriangle className="h-3 w-3" /> scan unavailable</Pill>
        ) : null}
      </div>

      {status === "error" && (
        <p className="mb-2 text-[11px] text-muted">
          {errMsg}. The valuation will proceed assuming market-typical condition.
        </p>
      )}

      {/* photo thumbnails with detection overlays */}
      <div className="flex flex-wrap gap-2">
        {photos.map((src, i) => (
          <div key={i} className="relative h-24 w-24 overflow-hidden rounded-xl border bg-black/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`scan ${i + 1}`} className="h-full w-full object-cover" />
            <AnimatePresence>
              {(dets[i] ?? []).map((d, j) => (
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
            {(status === "scanning") && !dets[i] && (
              <div className="absolute inset-0 grid place-items-center bg-black/25">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* per-class findings chips */}
      {cond && cond.findings.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {cond.findings.map((f) => (
            <span key={f.damage_type}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11px]">
              <span className="h-2 w-2 rounded-full" style={{ background: classColor(f.damage_type) }} />
              <span className="font-medium">{titleCase(f.damage_type.replace("_", " "))}</span>
              <span className="text-muted">×{f.instances}</span>
              <span className="text-bad tnum">−{f.value_impact_pct}%</span>
            </span>
          ))}
        </div>
      )}
      {cond && cond.findings.length === 0 && status === "done" && (
        <p className="mt-3 text-[11px] text-good">No visible damage detected — condition looks clean.</p>
      )}
    </motion.div>
  );
}
