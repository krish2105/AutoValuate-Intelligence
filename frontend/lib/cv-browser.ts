/**
 * In-browser YOLOv8 damage detection with onnxruntime-web (WASM EP).
 *
 * Runs the trained detector (cv-service/model/best.onnx → public/models/best.onnx)
 * entirely on-device: photos never leave the browser, and it costs no server RAM
 * (the Render free tier can't hold the ONNX session). This is the production path
 * for the "damage-aware" headline.
 *
 * The decode + NMS here are a faithful port of the backend reference decoder
 * (backend-api/agents/cv_local.py); the condition scoring mirrors the server
 * aggregation (backend-api/agents/aggregation_agent.py) so an in-browser scan and
 * a server scan produce the same condition score and price-adjustment factor.
 */
import type { InferenceSession, Tensor } from "onnxruntime-web";

export const CV_CLASSES = [
  "dent", "scratch", "crack", "glass_shatter",
  "lamp_broken", "tire_flat", "punctured", "missing_part",
] as const;
export type DamageClass = (typeof CV_CLASSES)[number];

const IMGSZ = 640;
const CONF_THRES = 0.35; // matches cv_local.py CONF_THRES
const IOU_THRES = 0.45;  // matches cv_local.py IOU_THRES
const MODEL_URL = "/models/best.onnx";

// Mirror of aggregation_agent.DAMAGE_SEVERITY (fraction of value lost per confident instance).
const DAMAGE_SEVERITY: Record<DamageClass, number> = {
  scratch: 0.010,
  dent: 0.020,
  lamp_broken: 0.020,
  crack: 0.030,
  glass_shatter: 0.045,
  tire_flat: 0.015,
  punctured: 0.035,
  missing_part: 0.050,
};
const MAX_TOTAL_DEDUCTION = 0.35; // aggregation_agent.MAX_TOTAL_DEDUCTION

export interface Detection {
  label: DamageClass;
  confidence: number;
  /** [x1, y1, x2, y2] normalized to [0,1] in the original image space. */
  box: [number, number, number, number];
}

export interface DamageFindingClient {
  damage_type: DamageClass;
  instances: number;
  max_confidence: number;
  photos_with_damage: number[];
  value_impact_pct: number;
}

/** Shape the backend expects for an optional client-side condition (see main.py ClientCondition). */
export interface ClientCondition {
  cv_available: true;
  condition_score: number;
  price_adjustment_factor: number;
  findings: DamageFindingClient[];
  photos_assessed: number;
  total_value_impact_pct: number;
  source: "browser";
}

type OrtModule = typeof import("onnxruntime-web/wasm");
let _ort: OrtModule | null = null;
let _sessionPromise: Promise<InferenceSession> | null = null;

async function getOrt(): Promise<OrtModule> {
  if (_ort) return _ort;
  // Load ORT's self-contained wasm-EP bundle from our own origin with a native
  // dynamic import. `webpackIgnore` keeps the bundler out of it entirely — Next's
  // Terser can't minify ORT's import.meta.url wasm glue, so we never let it try.
  // The specifier is a variable (not a literal) so TypeScript doesn't try to resolve
  // the /public path at compile time. The .mjs + .wasm come from scripts/copy-ort.mjs.
  const ortUrl = "/ort/ort.wasm.bundle.min.mjs";
  const mod: any = await import(/* webpackIgnore: true */ ortUrl);
  const ort: OrtModule = mod.default ?? mod;
  // Serve wasm binaries from our own origin (copied by scripts/copy-ort.mjs).
  ort.env.wasm.wasmPaths = "/ort/";
  // Single-threaded: avoids the COOP/COEP cross-origin-isolation headers threads need.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  _ort = ort;
  return ort;
}

/** Lazily create (and memoize) the inference session. First call downloads ~45 MB. */
export function loadSession(): Promise<InferenceSession> {
  if (!_sessionPromise) {
    _sessionPromise = (async () => {
      const ort = await getOrt();
      return ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
    })().catch((e) => {
      _sessionPromise = null; // allow a retry on failure
      throw e;
    });
  }
  return _sessionPromise;
}

/** True once the model bytes are cached (a quick HEAD) — lets the UI preload eagerly. */
export function modelIsReachable(): Promise<boolean> {
  return fetch(MODEL_URL, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
}

interface PreprocessResult {
  data: Float32Array;
  ratio: number;   // resize ratio applied (original → letterboxed)
  origW: number;
  origH: number;
}

/**
 * Letterbox to 640×640 (pad colour 114), RGB, /255, NCHW — identical to
 * cv_local._letterbox + the tensor build in detect().
 */
function preprocess(source: CanvasImageSource, origW: number, origH: number): PreprocessResult {
  const ratio = IMGSZ / Math.max(origW, origH);
  const nw = Math.round(origW * ratio);
  const nh = Math.round(origH * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = IMGSZ;
  canvas.height = IMGSZ;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "rgb(114,114,114)"; // letterbox pad colour
  ctx.fillRect(0, 0, IMGSZ, IMGSZ);
  ctx.drawImage(source, 0, 0, nw, nh); // top-left aligned, matching the backend

  const { data: rgba } = ctx.getImageData(0, 0, IMGSZ, IMGSZ);
  const area = IMGSZ * IMGSZ;
  const out = new Float32Array(3 * area); // NCHW
  for (let i = 0; i < area; i++) {
    out[i] = rgba[i * 4] / 255;               // R plane
    out[area + i] = rgba[i * 4 + 1] / 255;    // G plane
    out[2 * area + i] = rgba[i * 4 + 2] / 255; // B plane
  }
  return { data: out, ratio, origW, origH };
}

function iou(a: number[], b: number[]): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);
  const w = Math.max(0, x2 - x1);
  const h = Math.max(0, y2 - y1);
  const inter = w * h;
  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);
  return inter / (areaA + areaB - inter + 1e-9);
}

/** Greedy per-class NMS — mirror of cv_local._nms. */
function nms(boxes: number[][], scores: number[], iouThres: number): number[] {
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const keep: number[] = [];
  const removed = new Array(order.length).fill(false);
  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi];
    if (removed[oi]) continue;
    keep.push(i);
    for (let oj = oi + 1; oj < order.length; oj++) {
      if (removed[oj]) continue;
      if (iou(boxes[i], boxes[order[oj]]) > iouThres) removed[oj] = true;
    }
  }
  return keep;
}

/**
 * Decode raw YOLOv8 output [1, 12, 8400] → detections in normalized original coords.
 * Cols 0-3 = cx,cy,w,h (640 space); cols 4-11 = 8 class probs (already sigmoid).
 * Port of cv_local.detect()'s decode section.
 */
function decode(output: Tensor, meta: PreprocessResult): Detection[] {
  const dims = output.dims as number[]; // [1, 4+nc, 8400]
  const nc = dims[1] - 4;
  const n = dims[2];
  const raw = output.data as Float32Array;

  // channel-major: value(channel c, anchor a) = raw[c * n + a]
  const boxesByClass: Record<number, { box: number[]; score: number }[]> = {};
  for (let a = 0; a < n; a++) {
    let bestC = 0;
    let bestS = 0;
    for (let c = 0; c < nc; c++) {
      const s = raw[(4 + c) * n + a];
      if (s > bestS) { bestS = s; bestC = c; }
    }
    if (bestS <= CONF_THRES) continue;

    const cx = raw[0 * n + a];
    const cy = raw[1 * n + a];
    const w = raw[2 * n + a];
    const h = raw[3 * n + a];
    const box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]; // xyxy in 640 space
    (boxesByClass[bestC] ??= []).push({ box, score: bestS });
  }

  const dets: Detection[] = [];
  const denomW = meta.origW;
  const denomH = meta.origH;
  for (const cStr of Object.keys(boxesByClass)) {
    const c = Number(cStr);
    const group = boxesByClass[c];
    const boxes = group.map((g) => g.box);
    const scores = group.map((g) => g.score);
    for (const k of nms(boxes, scores, IOU_THRES)) {
      const b = boxes[k];
      // undo letterbox: divide by ratio → original pixels, then normalize + clip
      const x1 = Math.min(1, Math.max(0, b[0] / meta.ratio / denomW));
      const y1 = Math.min(1, Math.max(0, b[1] / meta.ratio / denomH));
      const x2 = Math.min(1, Math.max(0, b[2] / meta.ratio / denomW));
      const y2 = Math.min(1, Math.max(0, b[3] / meta.ratio / denomH));
      dets.push({
        label: CV_CLASSES[c],
        confidence: Math.round(scores[k] * 1e4) / 1e4,
        box: [x1, y1, x2, y2],
      });
    }
  }
  dets.sort((a, b) => b.confidence - a.confidence);
  return dets;
}

/** Run detection on one already-decoded image element. Returns detections. */
export async function detectImage(img: HTMLImageElement | ImageBitmap): Promise<Detection[]> {
  const session = await loadSession();
  const ort = await getOrt();
  const origW = "naturalWidth" in img ? img.naturalWidth || img.width : img.width;
  const origH = "naturalHeight" in img ? img.naturalHeight || img.height : img.height;
  if (!origW || !origH) return [];

  const meta = preprocess(img, origW, origH);
  const input = new ort.Tensor("float32", meta.data, [1, 3, IMGSZ, IMGSZ]);
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const results = await session.run({ [inputName]: input });
  return decode(results[outputName], meta);
}

/** Load a data-URL / object-URL string into an HTMLImageElement. */
export function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image failed to load"));
    el.src = src;
  });
}

/**
 * Merge detections across photos into per-class findings + a 0-100 condition score
 * and price-adjustment factor — a faithful port of aggregation_agent.aggregate()
 * so the browser result is interchangeable with the server's.
 */
export function conditionFromDetections(perPhoto: Detection[][]): ClientCondition {
  const perClass = new Map<DamageClass, { count: number; maxConf: number; photos: Set<number> }>();
  perPhoto.forEach((dets, photoIdx) => {
    for (const d of dets) {
      if (!(d.label in DAMAGE_SEVERITY) || d.confidence < CONF_THRES) continue;
      const slot = perClass.get(d.label) ?? { count: 0, maxConf: 0, photos: new Set<number>() };
      slot.count += 1;
      slot.maxConf = Math.max(slot.maxConf, d.confidence);
      slot.photos.add(photoIdx);
      perClass.set(d.label, slot);
    }
  });

  const findings: DamageFindingClient[] = [];
  let deduction = 0;
  const ordered = [...perClass.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [label, s] of ordered) {
    const sev = DAMAGE_SEVERITY[label];
    // diminishing marginal deduction per additional instance (matches server)
    const contrib = sev * (1 + 0.5 * (s.count - 1));
    deduction += contrib;
    findings.push({
      damage_type: label,
      instances: s.count,
      max_confidence: Math.round(s.maxConf * 1e3) / 1e3,
      photos_with_damage: [...s.photos].sort((a, b) => a - b),
      value_impact_pct: Math.round(contrib * 100 * 10) / 10,
    });
  }

  deduction = Math.min(deduction, MAX_TOTAL_DEDUCTION);
  return {
    cv_available: true,
    condition_score: Math.round(100 * (1 - deduction)),
    price_adjustment_factor: Math.round((1 - deduction) * 1e4) / 1e4,
    findings,
    photos_assessed: perPhoto.length,
    total_value_impact_pct: Math.round(deduction * 100 * 10) / 10,
    source: "browser",
  };
}

/** Per-class overlay colour, reading the active theme's semantic tokens. */
export function classColor(label: DamageClass): string {
  const structural: DamageClass[] = ["crack", "glass_shatter", "punctured", "missing_part"];
  const mechanical: DamageClass[] = ["tire_flat", "lamp_broken"];
  if (structural.includes(label)) return "hsl(var(--bad))";
  if (mechanical.includes(label)) return "hsl(var(--warn))";
  return "hsl(var(--info))"; // cosmetic: dent, scratch
}
