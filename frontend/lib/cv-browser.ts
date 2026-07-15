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
const CONF_THRES = 0.35;   // full-frame pass gate (matches cv_local.py CONF_THRES)
const DECODE_FLOOR = 0.20; // decode keeps everything above this; the per-pass gate is applied later
const IOU_THRES = 0.45;  // matches cv_local.py IOU_THRES
const MODEL_URL = "/models/best.onnx";

// Base cosmetic severity per class — the value fraction a *reference-sized* (~4% of the
// frame) instance costs. Extent (bbox area) and confidence scale this per detection below.
// Mirror of aggregation_agent.BASE_SEVERITY — keep the two in lock-step.
const BASE_SEVERITY: Record<DamageClass, number> = {
  scratch: 0.03,
  dent: 0.05,
  tire_flat: 0.06,
  lamp_broken: 0.07,
  crack: 0.10,
  glass_shatter: 0.14,
  punctured: 0.16,
  missing_part: 0.28,
};
// Classes that are structural by nature. Plus: ANY detection covering ≥ LARGE_AREA of the
// frame is treated as structural too — a "dent" spanning a quarter of the photo is a crush,
// not a door ding. This is the fix for a wrecked car scoring 98/100: the OLD logic counted
// instances and ignored area entirely, so a crushed front-end == one small dent == −2%.
// Structural (collision-indicating) classes. Their CO-OCCURRENCE escalates the score —
// a car showing crack + glass + lamp + missing_part has been in an accident, not just scuffed.
const STRUCTURAL = new Set<DamageClass>(["crack", "glass_shatter", "lamp_broken", "punctured", "missing_part", "tire_flat"]);
const REF_AREA = 0.06;        // area at which a detection reaches its base impact
const AREA_CAP = 2.5;         // a large box hits at most this × the base
const CONF_LO = 0.20;
const CONF_HI = 0.55;
const CONF_FLOOR = 0.35;      // even a borderline detection counts at least this much
const STRUCT_ESC = 0.4;       // co-occurrence exponent per extra structural finding
const MAX_TOTAL_DEDUCTION = 0.62; // photos alone can't wipe out >62%; rest disclosed as uncertainty

export type Severity = "minor" | "moderate" | "severe";

/** Box area as a fraction of the image (box is normalized [x1,y1,x2,y2]). */
function boxArea(box: readonly [number, number, number, number]): number {
  return Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
}

/** Down-weight borderline detections so the model's weak, low-confidence calls can't dominate. */
function confWeight(c: number): number {
  return Math.max(CONF_FLOOR, Math.min(1, (c - CONF_LO) / (CONF_HI - CONF_LO)));
}

/**
 * Fraction of value one detection costs. TYPE-dominant (structural ≫ cosmetic), with area
 * and confidence as bounded modifiers — because this detector emits few, small, sometimes
 * mislabelled boxes, so bbox area alone (the v1 approach) badly under-scored real wrecks.
 * Calibrated against real crashed-car photos.
 */
function detImpact(label: DamageClass, area: number, conf: number): number {
  const areaBoost = Math.max(1, Math.min(AREA_CAP, area / REF_AREA));
  return BASE_SEVERITY[label] * areaBoost * confWeight(conf);
}

/** A human severity band for one detection, from its class and how much of the frame it covers. */
export function severityOf(label: DamageClass, area: number): Severity {
  // scratches are cosmetic — a big one is still just paint, never "severe".
  if (label !== "scratch" && (area >= 0.12 || (STRUCTURAL.has(label) && area >= 0.05))) return "severe";
  if (area >= 0.05 || STRUCTURAL.has(label)) return "moderate";
  return "minor";
}

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
  /** Worst severity band seen for this damage class across all photos. */
  severity: Severity;
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
  /** Overall plain-language condition band derived from the score. */
  assessment: string;
  /** True when damage is significant/structural — the UI should advise a physical inspection. */
  needs_inspection: boolean;
}

/** Overall condition band from the 0-100 score — honest, no false precision. */
export function assessmentBand(score: number): string {
  if (score >= 90) return "Excellent — minimal visible damage";
  if (score >= 78) return "Good — minor cosmetic damage";
  if (score >= 60) return "Fair — notable damage";
  if (score >= 45) return "Poor — significant damage";
  return "Severe — major / likely structural damage";
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
interface Region { sx: number; sy: number; sw: number; sh: number; }

function preprocess(source: CanvasImageSource, region: Region): PreprocessResult {
  const { sx, sy, sw, sh } = region;
  const ratio = IMGSZ / Math.max(sw, sh);
  const nw = Math.round(sw * ratio);
  const nh = Math.round(sh * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = IMGSZ;
  canvas.height = IMGSZ;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "rgb(114,114,114)"; // letterbox pad colour
  ctx.fillRect(0, 0, IMGSZ, IMGSZ);
  // Draw only the [sx,sy,sw,sh] crop of the source, letterboxed top-left (matches backend).
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, nw, nh);

  const { data: rgba } = ctx.getImageData(0, 0, IMGSZ, IMGSZ);
  const area = IMGSZ * IMGSZ;
  const out = new Float32Array(3 * area); // NCHW
  for (let i = 0; i < area; i++) {
    out[i] = rgba[i * 4] / 255;               // R plane
    out[area + i] = rgba[i * 4 + 1] / 255;    // G plane
    out[2 * area + i] = rgba[i * 4 + 2] / 255; // B plane
  }
  // origW/origH carry the CROP dimensions so decode() normalizes boxes to the crop.
  return { data: out, ratio, origW: sw, origH: sh };
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
    if (bestS <= DECODE_FLOOR) continue;

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

const MIN_AREA = 0.0008; // drop pinprick boxes (<0.08% of frame) as likely noise
const TILE_CONF = 0.33;  // tile-only detections need a bit more confidence than the full pass
// The full frame plus 4 overlapping quadrants. A single 640² letterbox squashes a whole-car
// photo so small/localized damage vanishes; zooming into quadrants recovers it — the biggest
// single recall lever without retraining (a real wreck went 1 → 11 detections in testing).
const TILE_REGIONS: Array<[number, number, number, number]> = [
  [0, 0, 1, 1],       // full frame
  [0, 0, 0.6, 0.6],   // top-left
  [0.4, 0, 1, 0.6],   // top-right
  [0, 0.4, 0.6, 1],   // bottom-left
  [0.4, 0.4, 1, 1],   // bottom-right
];
// glass_shatter is hallucinated on zoomed tiles (window reflections/glare) at high confidence,
// so accept it ONLY from the full-frame pass, where it's reliable. Everything else: full+tiles.
const TILE_EXCLUDE = new Set<DamageClass>(["glass_shatter"]);

/** Run the model on one crop; returns detections normalized to the FULL image. */
async function inferRegion(
  session: InferenceSession, ort: OrtModule, img: CanvasImageSource,
  W: number, H: number, frac: [number, number, number, number], minConf: number,
): Promise<Detection[]> {
  const sx = frac[0] * W, sy = frac[1] * H;
  const sw = (frac[2] - frac[0]) * W, sh = (frac[3] - frac[1]) * H;
  const meta = preprocess(img, { sx, sy, sw, sh });
  const input = new ort.Tensor("float32", meta.data, [1, 3, IMGSZ, IMGSZ]);
  const results = await session.run({ [session.inputNames[0]]: input });
  // decode() returns boxes normalized to the CROP; remap each to full-image coords.
  return decode(results[session.outputNames[0]], meta)
    .filter((d) => d.confidence >= minConf)
    .map((d) => ({
      ...d,
      box: [
        (sx + d.box[0] * sw) / W, (sy + d.box[1] * sh) / H,
        (sx + d.box[2] * sw) / W, (sy + d.box[3] * sh) / H,
      ] as [number, number, number, number],
    }));
}

/** Per-class NMS over the union of all tile passes — dedupes the same damage seen in overlap. */
function mergeDetections(dets: Detection[]): Detection[] {
  const byClass = new Map<DamageClass, Detection[]>();
  for (const d of dets) {
    const g = byClass.get(d.label);
    if (g) g.push(d); else byClass.set(d.label, [d]);
  }
  const out: Detection[] = [];
  for (const group of byClass.values()) {
    const boxes = group.map((g) => g.box as unknown as number[]);
    const scores = group.map((g) => g.confidence);
    for (const k of nms(boxes, scores, IOU_THRES)) out.push(group[k]);
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Run detection on one image via TILED inference: the full frame plus 4 overlapping quadrants.
 * This detector emits few boxes on a whole-car photo (val recall ~0.4–0.5 on dents/cracks), so
 * zooming into quadrants is what actually surfaces real damage. glass_shatter is taken only from
 * the full pass (tiles hallucinate it). Union → per-class NMS → drop pinprick noise.
 */
export async function detectImage(img: HTMLImageElement | ImageBitmap): Promise<Detection[]> {
  const session = await loadSession();
  const ort = await getOrt();
  const W = "naturalWidth" in img ? img.naturalWidth || img.width : img.width;
  const H = "naturalHeight" in img ? img.naturalHeight || img.height : img.height;
  if (!W || !H) return [];

  const all: Detection[] = [];
  for (let i = 0; i < TILE_REGIONS.length; i++) {
    const isFull = i === 0;
    const dets = await inferRegion(session, ort, img, W, H, TILE_REGIONS[i], isFull ? CONF_THRES : TILE_CONF);
    for (const d of dets) {
      if (!isFull && TILE_EXCLUDE.has(d.label)) continue;
      all.push(d);
    }
  }
  return mergeDetections(all).filter((d) => boxArea(d.box) >= MIN_AREA);
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
  // Aggregate per class, but track area/impact per detection (not just a count), so the
  // score reflects how much of the car is damaged — not merely how many boxes fired.
  interface Slot {
    maxConf: number;
    photos: Set<number>;
    dets: { area: number; conf: number; impact: number }[];
    worstArea: number;
  }
  const perClass = new Map<DamageClass, Slot>();
  perPhoto.forEach((dets, photoIdx) => {
    for (const d of dets) {
      if (!(d.label in BASE_SEVERITY) || d.confidence < TILE_CONF) continue;
      const area = boxArea(d.box);
      const slot = perClass.get(d.label) ?? { maxConf: 0, photos: new Set<number>(), dets: [], worstArea: 0 };
      slot.maxConf = Math.max(slot.maxConf, d.confidence);
      slot.photos.add(photoIdx);
      slot.dets.push({ area, conf: d.confidence, impact: detImpact(d.label, area, d.confidence) });
      slot.worstArea = Math.max(slot.worstArea, area);
      perClass.set(d.label, slot);
    }
  });

  // Probabilistic union across every detection: kept = Π(1 − impact) ⇒ saturates naturally
  // as damage accumulates, instead of the old linear sum that a −35% cap had to rescue.
  const findings: DamageFindingClient[] = [];
  let keptAll = 1;
  let structHits = 0;
  const ordered = [...perClass.entries()].sort((a, b) => {
    const ia = a[1].dets.reduce((s, d) => s + d.impact, 0);
    const ib = b[1].dets.reduce((s, d) => s + d.impact, 0);
    return ib - ia;
  });
  for (const [label, s] of ordered) {
    let keptClass = 1;
    for (const d of s.dets) { keptClass *= 1 - d.impact; keptAll *= 1 - d.impact; }
    if (STRUCTURAL.has(label)) structHits += s.dets.length;
    const classImpact = 1 - keptClass;
    findings.push({
      damage_type: label,
      instances: s.dets.length,
      max_confidence: Math.round(s.maxConf * 1e3) / 1e3,
      photos_with_damage: [...s.photos].sort((a, b) => a - b),
      value_impact_pct: Math.round(classImpact * 100 * 10) / 10,
      severity: severityOf(label, s.worstArea),
    });
  }

  // Accident escalation: multiple co-occurring structural findings signal a collision, so
  // amplify the deduction (a wreck shows crack + glass + lamp + missing_part together).
  let deduction = 1 - keptAll;
  if (structHits >= 2) deduction = 1 - Math.pow(1 - deduction, 1 + STRUCT_ESC * (structHits - 1));
  deduction = Math.min(MAX_TOTAL_DEDUCTION, deduction);
  const score = Math.round(100 * (1 - deduction));
  const needsInspection = score < 70 || findings.some((f) => f.severity === "severe");
  return {
    cv_available: true,
    condition_score: score,
    price_adjustment_factor: Math.round((1 - deduction) * 1e4) / 1e4,
    findings,
    photos_assessed: perPhoto.length,
    total_value_impact_pct: Math.round(deduction * 100 * 10) / 10,
    source: "browser",
    assessment: assessmentBand(score),
    needs_inspection: needsInspection,
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
