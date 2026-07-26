/**
 * Capture-quality coaching — tells the user "step back", "it's cut off", "too blurry"
 * BEFORE a photo reaches the damage scan.
 *
 * WHY THIS EXISTS
 * ---------------
 * The damage detector is unstable to framing: on a real whole-car photo, a 3% crop can swing
 * the condition score by ~47 points (docs/CV_FINDINGS.md). That instability is a property of
 * the model and only a retrain fixes it. What we CAN do meanwhile is stop bad input reaching
 * it — a photo where the car is tiny, cut off, or blurred is exactly the input the detector
 * handles worst. Coaching the shot is the cheapest available lever on scan quality.
 *
 * ISOLATION — READ BEFORE EDITING
 * -------------------------------
 * Nothing here may ever influence a score. This module:
 *   - runs its own inference session on its own model (YOLOX-Nano, Apache-2.0),
 *   - imports nothing from cv-browser.ts and is imported by nothing in the scoring path,
 *   - produces advice for a human, never a number that reaches the pipeline.
 * That keeps the deterministic score and the browser<->backend scoring parity untouched.
 * Because of that isolation, ordinary canvas rasterisation is fine here — the bit-exactness
 * cv-browser.ts needs (it hand-rolls area-average resampling to stay deterministic) is
 * irrelevant for advice that is never scored.
 *
 * THRESHOLDS ARE MEASURED, NOT GUESSED
 * ------------------------------------
 * Calibrated on a real whole-car photo put through synthetic degradations, with blur and
 * luminance computed at a fixed 512px width so the numbers do not drift with image size:
 *
 *   sharp        blur 4218   lum 107        heavy blur   blur   13
 *   slight blur  blur  316   lum 107        dark         blur  140   lum 18.8
 *   blown out    blur 1182   lum 230        very dark    blur   30   lum  8.1
 *
 * Detector behaviour on the same photo: fill 78% framed well, 102% + cut-off when cropped in,
 * 9.6% when stood far back — all at >=0.65 confidence, including on the dark and blurred copies.
 */
import type { InferenceSession } from "onnxruntime-web";
import buildVersion from "./model-version.json";

/** COCO indices that count as "the vehicle". */
const VEHICLE_CLASSES = new Set([2, 5, 7]); // car, bus, truck
const MODEL_URL = "/models/yolox_nano.onnx";
const INPUT_SIZE = 416;
const STRIDES = [8, 16, 32];
const NUM_CLASSES = 80;

/** Width every image is normalised to before blur/exposure, so thresholds are size-stable. */
const ANALYSIS_WIDTH = 512;

export const THRESHOLDS = {
  /** Below this the detector's own confidence is too weak to advise on. */
  minConfidence: 0.35,
  /** Fraction of the frame the vehicle must fill. */
  minFill: 0.12,
  maxFill: 0.92,
  /** Distance from a frame edge (fraction) under which the vehicle counts as cut off. */
  edgeMargin: 0.01,
  /** Laplacian variance @512px. heavy-blur measured 13, slight-blur 316, sharp 4218. */
  minBlur: 40,
  /** Mean luminance 0-255. dark measured 18.8, normal 107, blown 230. */
  minLuminance: 45,
  maxLuminance: 215,
  /** IoU above which two boxes are treated as the same vehicle (de-duplication). */
  nmsIou: 0.45,
} as const;

export type CaptureIssue =
  | "no_vehicle" | "too_far" | "too_close" | "cut_off"
  | "blurry" | "too_dark" | "overexposed" | "multiple_vehicles";

export interface CaptureSignals {
  vehicleFound: boolean;
  confidence: number;
  /** Vehicle box area as a fraction of the frame, clamped to the frame. */
  fillRatio: number;
  cutOff: boolean;
  vehicleCount: number;
  blur: number;
  luminance: number;
}

export interface CaptureAssessment {
  ok: boolean;
  /** Worst issue, or null when the shot is fine. Drives the single line we show. */
  primary: CaptureIssue | null;
  issues: CaptureIssue[];
  message: string | null;
  signals: CaptureSignals;
}

export interface Box { x1: number; y1: number; x2: number; y2: number; score: number }

// ---------------------------------------------------------------- pure helpers

function iou(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const h = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const inter = w * h;
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  const union = areaA + areaB - inter;
  return union <= 0 ? 0 : inter / union;
}

/**
 * Greedy NMS. Without this the raw head emits ~11 boxes for ONE car (measured), which would
 * make any "multiple vehicles" warning fire on every single photo.
 */
export function nms(boxes: Box[], iouThreshold = THRESHOLDS.nmsIou): Box[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const keep: Box[] = [];
  for (const b of sorted) if (!keep.some((k) => iou(k, b) > iouThreshold)) keep.push(b);
  return keep;
}

/** Framing signals for the largest vehicle in the frame. Pure — unit-tested without a model. */
export function framing(boxes: Box[], width: number, height: number) {
  if (!boxes.length || width <= 0 || height <= 0) {
    return { fillRatio: 0, cutOff: false, confidence: 0, count: 0 };
  }
  const area = (b: Box) => (b.x2 - b.x1) * (b.y2 - b.y1);
  const main = boxes.reduce((m, b) => (area(b) > area(m) ? b : m));

  // Clamp for FILL (a box running off-frame must not report >100% coverage) but use the
  // unclamped box for CUT-OFF, which is precisely the "it runs off the edge" signal.
  const cx1 = Math.max(0, main.x1), cy1 = Math.max(0, main.y1);
  const cx2 = Math.min(width, main.x2), cy2 = Math.min(height, main.y2);
  const fillRatio = Math.max(0, (cx2 - cx1) * (cy2 - cy1)) / (width * height);

  const mx = width * THRESHOLDS.edgeMargin, my = height * THRESHOLDS.edgeMargin;
  const cutOff = main.x1 < mx || main.y1 < my || main.x2 > width - mx || main.y2 > height - my;

  return { fillRatio, cutOff, confidence: main.score, count: boxes.length };
}

/** Laplacian variance + mean luminance from a grayscale buffer. Pure. */
export function blurAndLuminance(gray: Float32Array | number[], w: number, h: number) {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const luminance = gray.length ? sum / gray.length : 0;

  // 4-neighbour Laplacian; variance over interior pixels only.
  let n = 0, mean = 0, m2 = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w];
      n++;
      const d = v - mean;
      mean += d / n;
      m2 += d * (v - mean);
    }
  }
  return { blur: n > 1 ? m2 / (n - 1) : 0, luminance };
}

const MESSAGES: Record<CaptureIssue, string> = {
  no_vehicle: "No car detected — make sure the whole car is in the shot.",
  too_far: "Too far away — step closer so the car fills more of the frame.",
  too_close: "Too close — step back so the whole car fits in the frame.",
  cut_off: "The car is cut off — step back to get all of it in frame.",
  blurry: "Blurry — hold still and tap to focus, then retake.",
  too_dark: "Too dark — move somewhere brighter or turn on more light.",
  overexposed: "Too bright — avoid shooting straight into the sun.",
  multiple_vehicles: "More than one car in frame — get closer to just yours.",
};

/**
 * Turn signals into advice. Pure, so the whole decision table is unit-tested.
 * Order matters: report the thing the user should fix FIRST. An unusable exposure or a
 * missing car is worth saying before quibbling about fill.
 */
export function judge(signals: CaptureSignals): CaptureAssessment {
  const issues: CaptureIssue[] = [];

  if (signals.luminance < THRESHOLDS.minLuminance) issues.push("too_dark");
  else if (signals.luminance > THRESHOLDS.maxLuminance) issues.push("overexposed");

  if (!signals.vehicleFound) issues.push("no_vehicle");
  else {
    if (signals.cutOff) issues.push("cut_off");
    else if (signals.fillRatio > THRESHOLDS.maxFill) issues.push("too_close");
    if (signals.fillRatio < THRESHOLDS.minFill) issues.push("too_far");
    if (signals.vehicleCount > 1) issues.push("multiple_vehicles");
  }

  // Blur last: a dark frame also has low Laplacian variance, so reporting "blurry" on an
  // under-exposed photo would send the user to fix the wrong thing.
  if (signals.blur < THRESHOLDS.minBlur && !issues.includes("too_dark")) issues.push("blurry");

  const primary = issues[0] ?? null;
  return {
    ok: issues.length === 0,
    primary,
    issues,
    message: primary ? MESSAGES[primary] : null,
    signals,
  };
}

// ---------------------------------------------------------------- inference

type OrtModule = typeof import("onnxruntime-web/wasm");
let _ort: OrtModule | null = null;
let _session: Promise<InferenceSession> | null = null;

/**
 * Same loader shape as cv-browser.ts, and for the same reason: Next's Terser cannot minify
 * ORT's `import.meta.url` wasm glue, and a plain `import("onnxruntime-web")` resolves to the
 * NODE build, which fails the production build outright ("'import' cannot be used outside of
 * module code"). `webpackIgnore` plus a variable specifier keeps the bundler out of it.
 * The browser caches the module, so this shares ORT with the damage scanner while still
 * creating its own separate InferenceSession.
 */
async function getOrt(): Promise<OrtModule> {
  if (_ort) return _ort;
  const ortUrl = `${buildVersion.ortDir}ort.wasm.bundle.min.mjs`;
  const mod: any = await import(/* webpackIgnore: true */ ortUrl);
  const ort: OrtModule = mod.default ?? mod;
  ort.env.wasm.wasmPaths = buildVersion.ortDir;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  _ort = ort;
  return ort;
}

/**
 * Lazily create the YOLOX session. Deliberately NOT called at page load: this is 3.5 MB on
 * top of the 43 MB damage model, and a user who never opens the camera must never pay for it.
 */
export function loadCoachSession(): Promise<InferenceSession> {
  if (!_session) {
    _session = getOrt().then((ort) =>
      ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] }));
    _session.catch(() => { _session = null; }); // let a failed load be retried
  }
  return _session;
}

/** Grid-decode YOLOX's raw head into absolute xywh at input scale. */
function decodeYolox(data: Float32Array, anchors: number): Float32Array {
  const stride = NUM_CLASSES + 5;
  let a = 0;
  for (const s of STRIDES) {
    const grid = INPUT_SIZE / s;
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++, a++) {
        if (a >= anchors) break;
        const o = a * stride;
        data[o] = (data[o] + gx) * s;
        data[o + 1] = (data[o + 1] + gy) * s;
        data[o + 2] = Math.exp(data[o + 2]) * s;
        data[o + 3] = Math.exp(data[o + 3]) * s;
      }
    }
  }
  return data;
}

/**
 * Letterbox onto a 114-grey canvas and emit BGR CHW float32 with NO /255 scaling — this is
 * YOLOX's own preprocessing (its reference impl feeds cv2's BGR array straight through).
 * Getting the channel order or the scaling wrong yields plausible-looking garbage.
 */
function preprocess(rgba: Uint8ClampedArray, w: number, h: number) {
  const r = Math.min(INPUT_SIZE / h, INPUT_SIZE / w);
  const nw = Math.round(w * r), nh = Math.round(h * r);
  const plane = INPUT_SIZE * INPUT_SIZE;
  const out = new Float32Array(3 * plane).fill(114);

  for (let y = 0; y < nh; y++) {
    const sy = Math.min(h - 1, Math.floor(y / r));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1, Math.floor(x / r));
      const s = (sy * w + sx) * 4;
      const d = y * INPUT_SIZE + x;
      out[d] = rgba[s + 2];              // B
      out[plane + d] = rgba[s + 1];      // G
      out[2 * plane + d] = rgba[s];      // R
    }
  }
  return { tensor: out, ratio: r };
}

/** Draw an image source to a canvas and read back RGBA + a normalised grayscale copy. */
function rasterize(src: CanvasImageSource, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;

  const gw = Math.min(ANALYSIS_WIDTH, w);
  const gh = Math.max(1, Math.round((h * gw) / w));
  const gc = document.createElement("canvas");
  gc.width = gw; gc.height = gh;
  const gctx = gc.getContext("2d", { willReadFrequently: true })!;
  gctx.drawImage(src, 0, 0, gw, gh);
  const gd = gctx.getImageData(0, 0, gw, gh).data;
  const gray = new Float32Array(gw * gh);
  for (let i = 0, p = 0; i < gd.length; i += 4, p++) {
    gray[p] = 0.299 * gd[i] + 0.587 * gd[i + 1] + 0.114 * gd[i + 2];
  }
  return { rgba, gray, gw, gh };
}

/**
 * Assess one captured photo. Never throws — a coach that crashes must not be able to block a
 * capture, so any failure degrades to "no advice" and the photo proceeds untouched.
 */
export async function assessCapture(file: Blob): Promise<CaptureAssessment | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const w = bitmap.width, h = bitmap.height;
    const { rgba, gray, gw, gh } = rasterize(bitmap, w, h);
    const { blur, luminance } = blurAndLuminance(gray, gw, gh);

    const session = await loadCoachSession();
    const ort = await getOrt();
    const { tensor, ratio } = preprocess(rgba, w, h);
    const feeds = { [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, INPUT_SIZE, INPUT_SIZE]) };
    const out = await session.run(feeds);
    const raw = out[session.outputNames[0]];
    const dims = raw.dims as number[];
    const anchors = dims[1];
    const stride = dims[2];
    const data = decodeYolox(raw.data as Float32Array, anchors);

    const boxes: Box[] = [];
    for (let a = 0; a < anchors; a++) {
      const o = a * stride;
      const obj = data[o + 4];
      let bestCls = -1, bestScore = 0;
      for (const c of VEHICLE_CLASSES) {
        const s = obj * data[o + 5 + c];
        if (s > bestScore) { bestScore = s; bestCls = c; }
      }
      if (bestCls < 0 || bestScore < THRESHOLDS.minConfidence) continue;
      const cx = data[o] / ratio, cy = data[o + 1] / ratio;
      const bw = data[o + 2] / ratio, bh = data[o + 3] / ratio;
      boxes.push({ x1: cx - bw / 2, y1: cy - bh / 2, x2: cx + bw / 2, y2: cy + bh / 2, score: bestScore });
    }

    const kept = nms(boxes);
    const f = framing(kept, w, h);
    bitmap.close?.();

    return judge({
      vehicleFound: kept.length > 0,
      confidence: f.confidence,
      fillRatio: f.fillRatio,
      cutOff: f.cutOff,
      vehicleCount: kept.length,
      blur,
      luminance,
    });
  } catch {
    return null; // advisory only — never block a capture because coaching failed
  }
}
