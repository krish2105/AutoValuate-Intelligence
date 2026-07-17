"use client";
import { useEffect, useRef, useState } from "react";
import {
  detectImage, loadImageEl, loadSession, conditionFromDetections,
  MODEL_VERSION, PREPROCESSING_VERSION, INFERENCE_CONFIG_VERSION,
  type ClientCondition, type Detection,
} from "@/lib/cv-browser";
import { photoHash, photoSetHash, EMPTY_PHOTO_SET_HASH } from "./hashes";

/**
 * The scan as one immutable, explicitly-staged job.
 *
 * WHY THIS EXISTS. Photos and the resulting condition used to be two independent pieces of
 * state (`photos` in vehicle-form, `clientCondition` set from a callback). Nothing tied
 * them together, so:
 *
 *   - Changing photos did not invalidate the old condition. Submitting mid-rescan sent the
 *     PREVIOUS photo set's damage result — a real price change — alongside the new photos.
 *   - Photos were identified by array index, so removing photo 0 renumbered the rest and
 *     the old boxes rendered over a different car.
 *   - A scan where every photo failed to decode was indistinguishable from a clean car:
 *     both produced zero findings and a 100/100 score.
 *
 * The fix is structural, not a new guard to remember: the job is DERIVED from the photos.
 * A condition cannot outlive the photo set that produced it, because it is a field of a
 * job whose identity is that photo set. Every result carries `photoSetHash` +
 * `modelVersion`, so a mismatch is detectable rather than merely unlikely.
 */

export type ScanStatus =
  | "idle"          // no photos
  | "hashing"       // establishing photo identity
  | "loading-model" // downloading/instantiating ONNX
  | "decoding"
  | "scanning"
  | "complete"      // every photo assessed (may still have zero findings — that's a real result)
  | "partial"       // at least one photo assessed, at least one failed
  | "failed"        // nothing assessable
  | "cancelled";    // superseded by a newer photo set

/** A scan status that will not change without new input. */
export const TERMINAL: readonly ScanStatus[] = ["idle", "complete", "partial", "failed", "cancelled"];
export const isTerminal = (s: ScanStatus) => TERMINAL.includes(s);

export interface ScanPhoto {
  /** SHA-256 of the decoded bytes — identity that survives reorder/removal/rename. */
  hash: string;
  src: string;
  assessed: boolean;
}

export interface ScanError {
  photoIndex: number;
  stage: "hash" | "model" | "decode" | "inference" | "aggregate";
  message: string;
}

export interface ScanJob {
  scanId: string;
  photoSetHash: string;
  modelVersion: string;
  preprocessingVersion: string;
  status: ScanStatus;
  photos: ScanPhoto[];
  /** Parallel to `photos`. A failed photo contributes [] — read `photos[i].assessed`. */
  detections: Detection[][];
  condition: ClientCondition | null;
  errors: ScanError[];
  startedAt: number;
  completedAt?: number;
}

// Monotonic per tab. Only needs to be unique within a session — it exists to discard
// superseded results, not to identify anything outside this browser.
let scanCounter = 0;
const nextScanId = () => `scan-${++scanCounter}`;

const EMPTY_PHOTOS: readonly string[] = [];

function idleJob(): ScanJob {
  return {
    scanId: nextScanId(), photoSetHash: EMPTY_PHOTO_SET_HASH, modelVersion: MODEL_VERSION,
    preprocessingVersion: PREPROCESSING_VERSION, status: "idle", photos: [], detections: [],
    condition: null, errors: [], startedAt: Date.now(),
  };
}

function pendingJob(photos: readonly string[]): ScanJob {
  return {
    scanId: nextScanId(), photoSetHash: "", modelVersion: MODEL_VERSION,
    preprocessingVersion: PREPROCESSING_VERSION, status: "hashing",
    photos: photos.map((src) => ({ hash: "", src, assessed: false })),
    // Deliberately empty, not carried over: stale boxes must never render against a new
    // photo set, even for the moment before the first new detection lands.
    detections: photos.map(() => []),
    condition: null, errors: [], startedAt: Date.now(),
  };
}

/** Reference-equality contents check — cheap, and enough: photo strings are never mutated. */
function sameContents(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

/**
 * Run (and re-run) the on-device scan for `photos`, returning the live job.
 *
 * The returned job always describes the CURRENT photos. There is no code path in which it
 * describes an older set: a change to `photos` resets the job during render, before any
 * consumer can read it.
 */
export function useScanJob(photos: readonly string[]): ScanJob {
  const [job, setJob] = useState<ScanJob>(idleJob);
  const prevPhotos = useRef<readonly string[]>(EMPTY_PHOTOS);
  // The photos this scan is for, pinned at reset. The effect must not read `photos` from
  // the render closure, or it would restart on unrelated parent re-renders.
  const photosRef = useRef<readonly string[]>(EMPTY_PHOTOS);

  // Reset during render, not in an effect. An effect runs AFTER the commit, which would
  // leave one painted frame where the new photos are on screen next to the old photo set's
  // condition and boxes — and one tick where a submit would send them. React explicitly
  // supports adjusting a component's own state while rendering.
  if (!sameContents(prevPhotos.current, photos)) {
    prevPhotos.current = photos;
    photosRef.current = photos;
    setJob(photos.length === 0 ? idleJob() : pendingJob(photos));
  }

  const scanId = job.scanId;

  useEffect(() => {
    // Keyed ONLY on scanId — the identity of this photo set's scan.
    //
    // `status` must NOT be a dependency, however tempting: this effect advances the status
    // itself, so depending on it makes the first commit ("loading-model") re-run the
    // effect, fire this run's cleanup, set cancelled = true, and silently strand the scan
    // it had just started. scanId changes only when the photos change, which is exactly
    // when a rescan is wanted.
    const srcs = photosRef.current;
    if (srcs.length === 0) return;

    let cancelled = false;
    // Every write goes through here, so a superseded scan physically cannot touch state.
    // The old code checked a run id at four points and was correct at those four points;
    // funnelling instead of guarding means there is no fifth place to forget.
    const commit = (patch: Partial<ScanJob>) => {
      if (cancelled) return;
      setJob((j) => (j.scanId !== scanId ? j : { ...j, ...patch }));
    };

    (async () => {
      const errors: ScanError[] = [];

      // 1. Identity first: a result is meaningless without knowing what it describes.
      let hashes: string[];
      let setHash: string;
      try {
        hashes = await Promise.all(srcs.map(photoHash));
        setHash = await photoSetHash(srcs);
      } catch (e: any) {
        commit({
          status: "failed", completedAt: Date.now(),
          errors: [{ photoIndex: -1, stage: "hash", message: e?.message || "could not read photos" }],
        });
        return;
      }
      if (cancelled) return;
      commit({
        status: "loading-model", photoSetHash: setHash,
        photos: srcs.map((src, i) => ({ hash: hashes[i], src, assessed: false })),
      });

      // 2. Model. A load failure is fatal for the whole job — not a clean car.
      try {
        await loadSession();
      } catch (e: any) {
        commit({
          status: "failed", completedAt: Date.now(),
          errors: [{ photoIndex: -1, stage: "model", message: e?.message || "the on-device model failed to load" }],
        });
        return;
      }
      if (cancelled) return;
      commit({ status: "decoding" });

      // 3. Per photo. Sequential on purpose: concurrent inference would interleave writes
      //    to one ORT session and make output order depend on scheduling.
      const detections: Detection[][] = srcs.map(() => []);
      const assessed: boolean[] = srcs.map(() => false);

      for (let i = 0; i < srcs.length; i++) {
        if (cancelled) return;
        try {
          const img = await loadImageEl(srcs[i]);
          if (cancelled) return;
          detections[i] = await detectImage(img);
          assessed[i] = true;
        } catch (e: any) {
          // Recorded, never swallowed. A photo we could not read is a photo we can say
          // nothing about, and the user is told which one.
          errors.push({
            photoIndex: i,
            stage: e?.message?.includes("decode") ? "decode" : "inference",
            message: e?.message || "could not scan this photo",
          });
        }
        commit({
          status: "scanning",
          detections: [...detections],
          photos: srcs.map((src, k) => ({ hash: hashes[k], src, assessed: assessed[k] })),
          errors: [...errors],
        });
        await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive between images
      }
      if (cancelled) return;

      // 4. Aggregate only over photos we actually assessed.
      const okIdx = srcs.map((_, i) => i).filter((i) => assessed[i]);
      if (okIdx.length === 0) {
        commit({ status: "failed", completedAt: Date.now(), errors: [...errors] });
        return;
      }
      const finalStatus: ScanStatus = okIdx.length === srcs.length ? "complete" : "partial";
      try {
        const condition = conditionFromDetections(
          okIdx.map((i) => detections[i]),
          { photoSetHash: setHash, photosAssessed: okIdx.length, status: finalStatus },
        );
        commit({ status: finalStatus, condition, completedAt: Date.now(), errors: [...errors] });
      } catch (e: any) {
        commit({
          status: "failed", completedAt: Date.now(),
          errors: [...errors, { photoIndex: -1, stage: "aggregate", message: e?.message || "scoring failed" }],
        });
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  return job;
}

/**
 * The submit gate. Returns null when the condition may be sent, or a human reason why not.
 *
 * Callers must not send a condition without consulting this — it is the single place that
 * decides whether a damage result is safe to price against.
 */
export function conditionBlockReason(
  job: ScanJob,
  photos: readonly string[],
  acceptedPartial: boolean,
): string | null {
  if (photos.length === 0) return null;                       // no photos, no claim
  if (!isTerminal(job.status)) return "the on-device scan is still running";
  if (job.status === "failed") return "the on-device scan failed";
  if (job.status === "partial" && !acceptedPartial) return "some photos could not be scanned";
  if (job.photos.length !== photos.length) return "the scan does not match the current photos";
  return null;
}
