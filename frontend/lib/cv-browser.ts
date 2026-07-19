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
import buildVersion from "./cv/model-version.json";

/**
 * Identity of the exact artifacts that produce a detection, generated at build time from
 * the model bytes (scripts/cv-version.mjs). A ClientCondition carries these so a result
 * can be traced back to the weights + runtime that produced it, and so a condition made by
 * an unrecognised model can be rejected rather than silently priced.
 */
export const MODEL_VERSION = buildVersion.modelVersion;
export const MODEL_SHA256 = buildVersion.modelSha256;
export const ORT_VERSION = buildVersion.ortVersion;

/**
 * Bump when ANY preprocessing or post-processing behaviour changes (sizes, letterbox,
 * normalization, thresholds, NMS/WBF, severity, aggregation). It is part of the condition's
 * identity: the same photo and the same weights can yield a different result under a
 * different config, so a stale condition must be detectable as stale. See
 * docs/CV_INFERENCE_SPEC.md — this constant and that document version together.
 */
// 1.1.0: preprocessing is now fully deterministic — the source is rasterized to a fixed CPU
// pixel buffer once and every resize is a pure-JS area-average, replacing ctx.drawImage's
// "high"-quality smoothing. That smoothing is GPU-accelerated and NOT bit-stable across calls
// when shrinking a large photo, so the same image produced slightly different 640² tensors and
// therefore a different number of borderline detections (a scratch flickering in/out) → a
// different score on each scan. See docs/CV_INFERENCE_SPEC.md §6 #4.
export const PREPROCESSING_VERSION = "1.1.0";
// 1.1.0: damage-EXTENT escalation (EXTENT_KNEE) so a large-area collision isn't "minor cosmetic".
// 1.2.0: STRUCT_*_FLOOR + finding-aware band — a detected moderate/severe crack (etc.) can't leave
// the car reading "Excellent — minimal visible damage". A scoring change = a config change.
// 1.3.0: detection gates recalibrated for WHOLE-CAR photos (CONF_THRES/TILE_CONF 0.35/0.33 ->
// 0.20) after a wrecked Civic scored 100/100, plus a TIRE_CONF gate and tire_flat added to
// TILE_EXCLUDE to stop the normal-wheel hallucination that scored a CLEAN car 38/100.
export const INFERENCE_CONFIG_VERSION = "1.3.0";

export const CV_CLASSES = [
  "dent", "scratch", "crack", "glass_shatter",
  "lamp_broken", "tire_flat", "punctured", "missing_part",
] as const;
export type DamageClass = (typeof CV_CLASSES)[number];

const IMGSZ = 640;
// 0.20, lowered from 0.35. MEASURED, not guessed: on a Honda Civic with a destroyed front end,
// the model's own detections peaked at missing_part 0.228 / dent 0.143 — every one of them below
// the old gate, so the car scored 100/100 "no visible damage". The detector is systematically
// under-confident on WHOLE-CAR photos (the same damage cropped scores 0.33), because it was
// trained on close-up damage crops. The gate was set for that training distribution, not for the
// wide shots users actually upload. See scripts/diagnose_scan.py.
const CONF_THRES = 0.20;   // full-frame pass gate (matches cv_local.py CONF_THRES)
const DECODE_FLOOR = 0.20; // decode keeps everything above this; the per-pass gate is applied later
const IOU_THRES = 0.45;  // matches cv_local.py IOU_THRES
// Content-addressed (`?v=<sha256[:12]>`) so a redeployed model is a cache miss rather than
// being served forever from the SW/HTTP caches. Generated — never hardcode this.
const MODEL_URL = buildVersion.modelUrl;

// Base cosmetic severity per class — the value fraction a *reference-sized* (~4% of the
// frame) instance costs. Extent (bbox area) and confidence scale this per detection below.
// Mirror of aggregation_agent.BASE_SEVERITY — keep the two in lock-step.
const BASE_SEVERITY: Record<DamageClass, number> = {
  scratch: 0.03,
  dent: 0.05,
  tire_flat: 0.06,
  lamp_broken: 0.07,
  crack: 0.10,
  // glass_shatter is deliberately LOW: a windshield is cheap to replace (~2-5% of value) and it's
  // the model's most FP-prone class (sky/scene reflections read as shattering; no pixel heuristic —
  // texture, edge-density, saturation — reliably separates them). It must never dominate; the
  // GLASS_CONF gate in detectImage further filters weaker reflection false positives.
  glass_shatter: 0.06,
  punctured: 0.16,
  missing_part: 0.28,
};
// Structural (collision-indicating) classes. Their CO-OCCURRENCE escalates the score —
// a car showing crack + glass + lamp + missing_part has been in an accident, not just scuffed.
const STRUCTURAL = new Set<DamageClass>(["crack", "glass_shatter", "lamp_broken", "punctured", "missing_part", "tire_flat"]);
const CONF_LO = 0.20;
const CONF_HI = 0.55;
const CONF_FLOOR = 0.35;      // even a borderline detection counts at least this much
const SEV_MULT_LO = 0.5;      // pixel severity 0..1 → impact multiplier 0.5..2.5
const SEV_MULT_HI = 2.5;
const STRUCT_ESC = 0.4;       // co-occurrence exponent per extra structural finding
const MAX_TOTAL_DEDUCTION = 0.62; // photos alone can't wipe out >62%; rest disclosed as uncertainty
// Damage-EXTENT escalation. The model often labels a whole crushed side as a few "dent" boxes, and
// three cosmetic dents can only ever deduct ~30% — so a real wreck read as "Good / minor cosmetic".
// This adds a label-agnostic signal: how much of the CAR is covered by damage. Extensive coverage
// is a major-damage signature regardless of the class label, so it escalates the deduction. Tuned
// (scratch/tune_extent.py) so clean=100, one small ding≈95, but a side-collision (~23% coverage)
// drops from 82→~53. Below the knee it does nothing, so minor cars are untouched.
const EXTENT_KNEE = 0.10;       // damage covering >10% of the frame begins to escalate
const EXTENT_ESC = 12.0;        // escalation strength above the knee
const EXTENT_SEVERE_COV = 0.20; // at/above this coverage the worst finding reads "severe" (honesty)
const COV_GRID = 48;            // grid resolution for the union-coverage estimate (parity w/ backend)
// A STRUCTURAL finding (crack/glass/lamp/punctured/missing_part/tire_flat) that grades moderate+
// implies real, possibly-hidden damage — a crack can mask impact damage behind the panel. Such a
// finding must not leave the car looking "Excellent" just because the model drew a small box, so
// its presence sets a floor on the total deduction (independent of box area). Minor structural
// findings (a hairline) are exempt. Tuned so one moderate crack ⇒ ~85 (Good), one severe ⇒ ~72.
const STRUCT_MOD_FLOOR = 0.15;  // ≥15% off when any structural finding is moderate
const STRUCT_SEV_FLOOR = 0.28;  // ≥28% off when any structural finding is severe

// Pixel-severity feature weights (kept in lock-step with cv_local.py). A detection's severity
// (0..1) is graded from the crop's pixels — texture/gradient energy (crumple, cracks, scrapes),
// dark fraction (deep dents, holes, voids), and extent — not just its box size.
const SEV_W_AREA = 0.42, SEV_W_GRAD = 0.34, SEV_W_DARK = 0.24;
const SEV_GRAD_NORM = 0.16, SEV_DARK_NORM = 0.45, SEV_AREA_NORM = 0.14;
const SEV_CLASS_PRIOR: Partial<Record<DamageClass, number>> = {
  glass_shatter: 0.15, missing_part: 0.20, punctured: 0.15, crack: 0.10, lamp_broken: 0.08,
};

export type Severity = "minor" | "moderate" | "severe";

/**
 * Plain-language, buyer/seller-facing explanation of each damage class — so a non-expert reading
 * a scan understands WHAT was found, what it means for the car's value, and roughly how it's
 * fixed. Deliberately no fabricated dirham figures (the model can't cost a repair from a photo);
 * guidance is qualitative and honest. `note(sev)` adds a severity-aware nuance.
 */
export interface DamageInfo {
  what: string;
  impact: string;
  repair: string;
  note: (sev: Severity) => string;
}
const sevNote = (minor: string, moderate: string, severe: string) =>
  (s: Severity) => (s === "severe" ? severe : s === "moderate" ? moderate : minor);

export const DAMAGE_INFO: Record<DamageClass, DamageInfo> = {
  dent: {
    what: "A pushed-in section of a body panel or door.",
    impact: "Cosmetic — it lowers kerb appeal and resale, but doesn't change how the car drives.",
    repair: "Small dents: paintless dent removal (low cost). Creased or painted-through dents: panel repair + respray.",
    note: sevNote("A minor ding — an easy negotiation point.", "Noticeable — factor a panel repair into the price.",
      "A large/creased dent — likely panel work and paint."),
  },
  scratch: {
    what: "Paint scraped on the surface of a panel.",
    impact: "Mostly cosmetic. Scratches deep enough to reach bare metal can rust if left, so they matter more.",
    repair: "Light: machine polish. Deep/through-to-primer: a localised respray of the panel.",
    note: sevNote("Surface-level — usually polishes out.", "Deeper marks — a localised respray may be needed.",
      "Extensive scuffing — plan on repainting the affected panels."),
  },
  crack: {
    what: "A split in a bumper, trim or plastic panel — sometimes the sign of a knock.",
    impact: "Cosmetic to moderate. Check what's behind it: a cracked bumper can hide mounting or impact damage.",
    repair: "Plastic weld + fill + paint, or replace the part if the crack is large.",
    note: sevNote("A small crack — mostly cosmetic.", "A clear crack — inspect the area behind it.",
      "A large crack — treat as possible impact damage and inspect underneath."),
  },
  glass_shatter: {
    what: "Cracked or shattered glass, usually the windshield.",
    impact: "Cheap to fix, but a safety and registration item — it must be sorted before a sale or RTA inspection.",
    repair: "Chip repair if small; otherwise a full glass replacement (widely available and inexpensive).",
    note: sevNote("A chip or small crack — often repairable.", "Cracked glass — plan a replacement before sale.",
      "Shattered glass — replace before driving/registration."),
  },
  lamp_broken: {
    what: "A cracked or broken head-lamp or tail-lamp.",
    impact: "Small cost, but a failed light blocks RTA registration and is an easy point to negotiate on.",
    repair: "Replace the lamp unit; genuine parts cost more than aftermarket equivalents.",
    note: sevNote("A cracked lens — minor.", "A broken lamp — replace before registration.",
      "Lamp destroyed — a replacement unit is required."),
  },
  tire_flat: {
    what: "A flat, worn or damaged tyre.",
    impact: "Low cost on its own, but check the rim and wheel alignment for hidden damage.",
    repair: "Repair or replace the tyre; inspect the alloy for cracks or bends.",
    note: sevNote("Low tyre — may just need air/repair.", "Damaged tyre — budget a replacement.",
      "Tyre destroyed — replace and check the rim + suspension."),
  },
  punctured: {
    what: "A panel or component pierced through — the metal is broken, not just dented.",
    impact: "More serious than a dent: it implies a harder impact. Inspect the area underneath.",
    repair: "Panel-section replacement or professional metal repair, then respray.",
    note: sevNote("A small puncture — repairable.", "A clear puncture — implies a real knock; inspect behind it.",
      "Significant puncture — likely collision damage; get it inspected."),
  },
  missing_part: {
    what: "A body part is missing — bumper, mirror, grille or trim.",
    impact: "Needs sourcing + fitting, and can be a sign of a previous collision, so the price impact is larger.",
    repair: "Source the correct part (OEM or good used) and fit + paint to match.",
    note: sevNote("A small missing trim piece.", "A missing part — source and refit before sale.",
      "A major part missing — treat as possible collision history and inspect."),
  },
};

/** Box area as a fraction of the image (box is normalized [x1,y1,x2,y2]). */
function boxArea(box: readonly [number, number, number, number]): number {
  return Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
}

/** Down-weight borderline detections so the model's weak, low-confidence calls can't dominate. */
function confWeight(c: number): number {
  return Math.max(CONF_FLOOR, Math.min(1, (c - CONF_LO) / (CONF_HI - CONF_LO)));
}

/**
 * Pixel evidence corroborates the detection: strong crumple/void pixels raise trust even when
 * the model's own confidence is low (a 94%-severe missing_part at conf 0.35 is real).
 */
function effWeight(conf: number, sev: number): number {
  const cw = confWeight(conf);
  return Math.min(1, cw + (1 - cw) * sev * 0.65);
}

/**
 * Fraction of value one detection costs. TYPE-dominant (structural ≫ cosmetic), scaled by the
 * pixel-graded severity (0..1) and the confidence-blended trust — because this detector emits
 * few, small, sometimes-mislabelled boxes, so bbox area alone badly under-scored real wrecks.
 */
function detImpact(label: DamageClass, sev: number, conf: number): number {
  return BASE_SEVERITY[label] * (SEV_MULT_LO + (SEV_MULT_HI - SEV_MULT_LO) * sev) * effWeight(conf, sev);
}

/**
 * Grade severity (0..1) from a 48×48 grayscale crop: gradient energy (crumple/cracks/scrapes) +
 * dark fraction (deep dents/holes/voids) + extent. Pure + testable for backend parity. np.gradient
 * central-difference is replicated exactly. Add the class prior (structural bias) at the call site.
 */
export function severityFromGray(g: Float32Array, area: number): number {
  const N = 48;
  let gradSum = 0, dark = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const gx = x === 0 ? g[i + 1] - g[i]
        : x === N - 1 ? g[i] - g[i - 1]
        : (g[i + 1] - g[i - 1]) / 2;
      const gy = y === 0 ? g[i + N] - g[i]
        : y === N - 1 ? g[i] - g[i - N]
        : (g[i + N] - g[i - N]) / 2;
      gradSum += Math.hypot(gx, gy);
      if (g[i] < 0.18) dark++;
    }
  }
  const grad = gradSum / (N * N);
  const darkFrac = dark / (N * N);
  const raw = SEV_W_AREA * Math.min(1, area / SEV_AREA_NORM)
    + SEV_W_GRAD * Math.min(1, grad / SEV_GRAD_NORM)
    + SEV_W_DARK * Math.min(1, darkFrac / SEV_DARK_NORM);
  return Math.min(1, raw);
}

/**
 * A fixed snapshot of the source image's pixels. Producing this ONCE per scan (a 1:1 draw with
 * no resampling, then getImageData) is the only GPU→CPU step; from here every resize is pure JS
 * over this buffer, so the whole pipeline is deterministic. Type-compatible with ImageData.
 */
type Raster = { data: Uint8ClampedArray; width: number; height: number };

/**
 * Deterministic box (area-average) downscale of one output cell. Averages every source pixel
 * whose centre-region overlaps [x0,x1)×[y0,y1); pure integer indexing over a fixed buffer, so
 * the result depends only on the pixels — never on the GPU, the canvas, or timing. Guarantees at
 * least one source pixel (nearest-neighbour when a crop is upscaled). Returns 0..255 RGB.
 */
function avgCell(src: Raster, x0: number, x1: number, y0: number, y1: number): [number, number, number] {
  const W = src.width, H = src.height, d = src.data;
  let ix0 = Math.max(0, Math.floor(x0)), ix1 = Math.min(W, Math.ceil(x1));
  let iy0 = Math.max(0, Math.floor(y0)), iy1 = Math.min(H, Math.ceil(y1));
  if (ix1 <= ix0) { ix0 = Math.min(Math.max(0, ix0), W - 1); ix1 = ix0 + 1; }
  if (iy1 <= iy0) { iy0 = Math.min(Math.max(0, iy0), H - 1); iy1 = iy0 + 1; }
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = iy0; y < iy1; y++) {
    const row = y * W * 4;
    for (let x = ix0; x < ix1; x++) {
      const i = row + x * 4;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
  }
  return [r / n, g / n, b / n];
}

/** Snapshot a decoded image to a fixed CPU pixel buffer (1:1, no resample → exact + stable). */
function rasterize(source: CanvasImageSource, W: number, H: number): Raster {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false; // 1:1 blit, so there is nothing to resample
  ctx.drawImage(source, 0, 0);
  return ctx.getImageData(0, 0, W, H);
}

/** Grade a box crop's severity (0..1) from a deterministic 48×48 grey area-average of the raster.
 *  Exported for the determinism check (scripts/cv-determinism-run.mjs). */
export function cropSeverity(src: Raster, box: readonly [number, number, number, number], label: DamageClass): number {
  const W = src.width, H = src.height;
  const x1 = box[0] * W, y1 = box[1] * H;
  const x2 = Math.max(x1 + 1, box[2] * W), y2 = Math.max(y1 + 1, box[3] * H);
  const cw = x2 - x1, ch = y2 - y1;
  const g = new Float32Array(48 * 48);
  for (let oy = 0; oy < 48; oy++) {
    const gy0 = y1 + (oy * ch) / 48, gy1 = y1 + ((oy + 1) * ch) / 48;
    for (let ox = 0; ox < 48; ox++) {
      const gx0 = x1 + (ox * cw) / 48, gx1 = x1 + ((ox + 1) * cw) / 48;
      const [r, gg, b] = avgCell(src, gx0, gx1, gy0, gy1);
      g[oy * 48 + ox] = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
    }
  }
  const sev = severityFromGray(g, boxArea(box)) + (SEV_CLASS_PRIOR[label] ?? 0);
  return Math.min(1, sev);
}

/** A human severity band for one detection, from its pixel-graded severity (0..1). */
export function severityOf(label: DamageClass, sev: number): Severity {
  // scratches are cosmetic and a shattered windshield, though dramatic, is a cheap repair — so
  // in a *valuation* context neither is "severe" no matter how it grades on pixels.
  if (label === "scratch" || label === "glass_shatter") return sev >= 0.5 ? "moderate" : "minor";
  if (sev >= 0.62) return "severe";
  if (sev >= 0.34) return "moderate";
  return "minor";
}

export interface Detection {
  label: DamageClass;
  confidence: number;
  /** [x1, y1, x2, y2] normalized to [0,1] in the original image space. */
  box: [number, number, number, number];
  /** Pixel-graded severity (0..1), attached by detectImage. Optional until then. */
  sev?: number;
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
  /**
   * "browser"   — produced by a real on-device scan of real photos.
   * "synthetic" — fabricated from UI inputs with no detector involved: the what-if sliders
   *               and the demo-garage fixtures. These MUST NOT claim to be scans; labelling
   *               a slider result "browser" makes a hypothetical indistinguishable from
   *               evidence, both to the backend and to anyone auditing where a price came from.
   */
  source: "browser" | "synthetic";
  /** Overall plain-language condition band derived from the score. */
  assessment: string;
  /** True when damage is significant/structural — the UI should advise a physical inspection. */
  needs_inspection: boolean;

  // ---- Provenance. Everything below binds this condition to the exact inputs that
  // produced it. Without these a condition is an anonymous number that reduces a price by
  // up to 62%, with no way to tell whether it came from these photos, other photos, an
  // older model, or a hand-written POST. They are what makes a damage finding traceable
  // back to a specific image + model + detection output.

  /** SHA-256 over the ordered per-photo byte hashes (lib/cv/hashes.photoSetHash). */
  photo_set_hash: string;
  /** SHA-256[:12] of the .onnx that produced the detections. */
  model_version: string;
  preprocessing_version: string;
  inference_config_version: string;
  /**
   * "complete" — every photo decoded and scanned.
   * "partial"  — at least one photo failed; the score covers only `photos_assessed` of them.
   * A partial scan is NOT a clean bill of health, and must never be submitted without the
   * user explicitly accepting it. This distinction did not previously exist: a scan where
   * every photo failed to decode was indistinguishable from a scan that found no damage.
   */
  status: "complete" | "partial";
  /**
   * Explicit user consent to be valued on an incomplete (partial) scan. Set true only when
   * the user ticks the "value it anyway" box. The server rejects a `status:"partial"`
   * condition that arrives without this, so a partial scan can never silently deflate a
   * price. Absent/false for complete and synthetic conditions.
   */
  partial_scan_consent?: boolean;
}

/**
 * Provenance fields for a condition that no detector produced (what-if sliders,
 * demo-garage fixtures). Spread into such a condition so it is self-describing rather
 * than masquerading as a scan result.
 */
export const SYNTHETIC_PROVENANCE = {
  source: "synthetic",
  photo_set_hash: "none",
  model_version: "none",
  preprocessing_version: "none",
  inference_config_version: "none",
  status: "complete",
} as const satisfies Partial<ClientCondition>;

/**
 * Overall condition band from the 0-100 score — honest, no false precision. `hasModeratePlus`
 * (any finding graded moderate/severe) forbids the "Excellent — minimal visible damage" wording:
 * a scan that FOUND a real crack/dent cannot also call the car's damage "minimal". Without this a
 * 90 with a moderate crack read as "Excellent", which contradicts its own findings list.
 */
export function assessmentBand(score: number, hasModeratePlus = false): string {
  if (score >= 90 && !hasModeratePlus) return "Excellent — minimal visible damage";
  if (score >= 78) return hasModeratePlus
    ? "Good — visible damage; inspect the flagged area" : "Good — minor cosmetic damage";
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
  const ortUrl = `${buildVersion.ortDir}ort.wasm.bundle.min.mjs`;
  const mod: any = await import(/* webpackIgnore: true */ ortUrl);
  const ort: OrtModule = mod.default ?? mod;
  // Serve wasm binaries from our own origin, under the version-scoped directory that
  // scripts/copy-ort.mjs wrote — see MODEL_VERSION above for why the path carries a version.
  ort.env.wasm.wasmPaths = buildVersion.ortDir;
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

/** Exported for the determinism check (scripts/cv-determinism-run.mjs). */
export function preprocess(src: Raster, region: Region): PreprocessResult {
  const { sx, sy, sw, sh } = region;
  const ratio = IMGSZ / Math.max(sw, sh);
  const nw = Math.round(sw * ratio);
  const nh = Math.round(sh * ratio);

  const area = IMGSZ * IMGSZ;
  const out = new Float32Array(3 * area); // NCHW
  out.fill(114 / 255); // letterbox pad colour everywhere; the image overwrites the top-left nw×nh
  // Deterministic area-average downscale of the [sx,sy,sw,sh] crop into the top-left nw×nh.
  // No canvas, no GPU resampler: identical pixels in ⇒ identical tensor out, every time.
  for (let oy = 0; oy < nh; oy++) {
    const gy0 = sy + (oy * sh) / nh, gy1 = sy + ((oy + 1) * sh) / nh;
    for (let ox = 0; ox < nw; ox++) {
      const gx0 = sx + (ox * sw) / nw, gx1 = sx + ((ox + 1) * sw) / nw;
      const [r, g, b] = avgCell(src, gx0, gx1, gy0, gy1);
      const p = oy * IMGSZ + ox;
      out[p] = r / 255;             // R plane
      out[area + p] = g / 255;      // G plane
      out[2 * area + p] = b / 255;  // B plane
    }
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
const TILE_CONF = 0.20;  // tile pass gate — lowered with CONF_THRES; see the note there
// Full frame + top half + the two bottom quadrants (4 passes). A single 640² letterbox
// squashes a whole-car photo so small/localized damage vanishes; zooming into regions recovers
// it — the biggest recall lever without retraining. This 4-pass layout matched full+4-quadrants
// (5 passes) exactly on real crashed-car photos while being ~20% faster: the top half catches
// roof/glass, and the two bottom quadrants zoom into where collision damage concentrates
// (bumpers, front-end, wheels). No blind region.
const TILE_REGIONS: Array<[number, number, number, number]> = [
  [0, 0, 1, 1],       // full frame
  [0, 0, 1, 0.6],     // top half (roof, glass, upper panels)
  [0, 0.4, 0.6, 1],   // bottom-left quadrant
  [0.4, 0.4, 1, 1],   // bottom-right quadrant
];
// glass_shatter is hallucinated on zoomed tiles (window reflections/glare) at high confidence,
// so accept it ONLY from the full-frame pass, where it's reliable. Everything else: full+tiles.
// tire_flat joins glass_shatter here for the same measured reason: on a ZOOMED tile the model
// calls a perfectly normal wheel "tire_flat" at 0.77 confidence. That single hallucination scored
// an undamaged car 38/100 under the old config — the mirror image of the Civic bug, and the same
// thing that tanked a clean car when 3x3 tiling was trialled. Both classes are accepted only from
// the full frame, where they are reliable.
const TILE_EXCLUDE = new Set<DamageClass>(["glass_shatter", "tire_flat"]);
// ...and even on the full pass it FPs on windshield reflections. Real shattered glass is reliably
// detected ≥0.75, so demand higher confidence for it to drop weaker reflection false positives.
const GLASS_CONF = 0.55;
// Same treatment for tire_flat on the full pass: it is the model's other reflection-style
// hallucination (normal wheels), so it must clear a much higher bar than the general gate.
const TIRE_CONF = 0.55;

/** Run the model on one crop; returns detections normalized to the FULL image. */
async function inferRegion(
  session: InferenceSession, ort: OrtModule, raster: Raster,
  W: number, H: number, frac: [number, number, number, number], minConf: number,
): Promise<Detection[]> {
  const sx = frac[0] * W, sy = frac[1] * H;
  const sw = (frac[2] - frac[0]) * W, sh = (frac[3] - frac[1]) * H;
  const meta = preprocess(raster, { sx, sy, sw, sh });
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

const WBF_IOU = 0.55;
const AGREE_BONUS = 0.05; // +conf per extra tile a box was seen in (independent-crop agreement)

function iou1(a: readonly number[], b: readonly number[]): number {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]), y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return inter / (ua + 1e-9);
}

/**
 * Weighted Box Fusion over the tile passes. Unlike NMS (keep one box, discard the rest), WBF
 * fuses a cluster of overlapping same-class boxes into a confidence-weighted average box —
 * tighter localization — and boosts the fused confidence when several independent crops agree.
 */
function mergeDetections(dets: Detection[]): Detection[] {
  const byClass = new Map<DamageClass, Detection[]>();
  for (const d of dets) {
    const g = byClass.get(d.label);
    if (g) g.push(d); else byClass.set(d.label, [d]);
  }
  const out: Detection[] = [];
  for (const [label, group] of byClass) {
    const sorted = [...group].sort((a, b) => b.confidence - a.confidence);
    const clusters: { box: number[]; boxes: number[][]; confs: number[] }[] = [];
    for (const d of sorted) {
      const hit = clusters.find((c) => iou1(c.box, d.box) >= WBF_IOU);
      if (hit) {
        hit.boxes.push(d.box); hit.confs.push(d.confidence);
        const wsum = hit.confs.reduce((s, c) => s + c, 0);
        hit.box = [0, 1, 2, 3].map((i) => hit.boxes.reduce((s, b, k) => s + b[i] * hit.confs[k], 0) / wsum);
      } else {
        clusters.push({ box: [...d.box], boxes: [d.box], confs: [d.confidence] });
      }
    }
    for (const c of clusters) {
      const fusedConf = Math.min(0.98, Math.max(...c.confs) + AGREE_BONUS * (c.confs.length - 1));
      out.push({ label, confidence: fusedConf, box: c.box as [number, number, number, number] });
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/** Canonical output order (spec §3.10): class_id ASC, confidence DESC, then x1,y1,x2,y2. */
function canonicalSort(dets: Detection[]): Detection[] {
  return dets.sort((a, b) =>
    CV_CLASSES.indexOf(a.label) - CV_CLASSES.indexOf(b.label)
    || b.confidence - a.confidence
    || a.box[0] - b.box[0] || a.box[1] - b.box[1] || a.box[2] - b.box[2] || a.box[3] - b.box[3]);
}

/**
 * The post-inference fusion + filter pipeline (spec §3.7 steps 3–6), pure and shared between
 * the real scan and the cross-language conformance test (eval/cv_conformance*): Weighted Box
 * Fusion → drop boxes below MIN_AREA → drop low-confidence glass_shatter → canonical order.
 * Given identical per-tile detections, this MUST match backend cv_local._fuse_detections; the
 * model + preprocessing (canvas vs cv2 resample, EXIF) still differ — see spec §6.
 */
export function fuseDetections(dets: Detection[]): Detection[] {
  const fused = mergeDetections(dets).filter((d) =>
    boxArea(d.box) >= MIN_AREA
    && !(d.label === "glass_shatter" && d.confidence < GLASS_CONF)
    && !(d.label === "tire_flat" && d.confidence < TIRE_CONF));
  return canonicalSort(fused);
}

/**
 * Run detection on one image: TILED inference (full + top-half + 2 bottom quadrants) → Weighted
 * Box Fusion → a pixel-graded severity (0..1) per detection from the crop's texture/shadow/extent.
 * This detector emits few, small boxes on a whole-car photo, so tiling surfaces the damage and the
 * pixel-severity head grades how bad each one actually is. glass_shatter is taken only from the
 * full pass (tiles hallucinate it). Mirror of backend cv_local.detect.
 */
export async function detectImage(img: HTMLImageElement | ImageBitmap): Promise<Detection[]> {
  const session = await loadSession();
  const ort = await getOrt();
  const W = "naturalWidth" in img ? img.naturalWidth || img.width : img.width;
  const H = "naturalHeight" in img ? img.naturalHeight || img.height : img.height;
  if (!W || !H) return [];

  // Snapshot the pixels ONCE — every tile crop and severity crop reads this fixed buffer, so the
  // scan is a pure function of the image bytes (no per-call GPU resample = no score drift).
  const raster = rasterize(img, W, H);

  const all: Detection[] = [];
  for (let i = 0; i < TILE_REGIONS.length; i++) {
    const isFull = i === 0;
    const dets = await inferRegion(session, ort, raster, W, H, TILE_REGIONS[i], isFull ? CONF_THRES : TILE_CONF);
    for (const d of dets) {
      if (!isFull && TILE_EXCLUDE.has(d.label)) continue;
      all.push(d);
    }
  }
  const fused = fuseDetections(all); // WBF → MIN_AREA → glass gate → canonical order (spec §3.7)
  for (const d of fused) d.sev = cropSeverity(raster, d.box, d.label);
  return fused;
}

/** Load a data-URL / object-URL string into an HTMLImageElement. */
export function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = async () => {
      // `onload` means the bytes downloaded — NOT that the pixels are decoded. Drawing a
      // not-yet-decoded image to the canvas reads timing-dependent partial pixels, so the
      // SAME photo produced a DIFFERENT tensor (and a different score) on each scan. decode()
      // forces a complete decode before we ever draw it. (Tiny images decode synchronously,
      // which is why the bug only showed on real, large photos.)
      try {
        if (typeof el.decode === "function") await el.decode();
      } catch {
        /* decode() can reject in some engines even when the pixels are usable; onload already fired */
      }
      resolve(el);
    };
    el.onerror = () => reject(new Error("image failed to load"));
    el.src = src;
  });
}

/**
 * Merge detections across photos into per-class findings + a 0-100 condition score
 * and price-adjustment factor — a faithful port of aggregation_agent.aggregate()
 * so the browser result is interchangeable with the server's.
 */
/**
 * Fraction of the frame covered by damage, as a UNION over the boxes (grid-rasterized so
 * overlapping boxes aren't double-counted). Deterministic; mirrored in aggregation_agent._coverage.
 * This is the "how much of the car is damaged" signal that box counts and per-class impact miss.
 */
function damageCoverage(dets: { box: readonly number[] }[]): number {
  if (dets.length === 0) return 0;
  const G = COV_GRID;
  const grid = new Uint8Array(G * G);
  for (const d of dets) {
    const x0 = Math.max(0, Math.floor(d.box[0] * G)), x1 = Math.min(G, Math.ceil(d.box[2] * G));
    const y0 = Math.max(0, Math.floor(d.box[1] * G)), y1 = Math.min(G, Math.ceil(d.box[3] * G));
    for (let gy = y0; gy < y1; gy++) for (let gx = x0; gx < x1; gx++) grid[gy * G + gx] = 1;
  }
  let n = 0;
  for (let i = 0; i < grid.length; i++) n += grid[i];
  return n / (G * G);
}

/** Pixel severity if the detector attached it; else a coarse area+class fallback (mirrors backend). */
function sevOfDet(d: Detection): number {
  if (d.sev != null) return d.sev;
  const area = boxArea(d.box);
  return Math.min(1, 0.6 * Math.min(1, area / 0.14) + (SEV_CLASS_PRIOR[d.label] ?? 0));
}

/** Provenance the aggregator cannot derive from detections alone — supplied by the caller. */
export interface ConditionBinding {
  /** lib/cv/hashes.photoSetHash of the exact set these detections came from. */
  photoSetHash: string;
  /**
   * Photos that decoded AND completed inference. Deliberately not `perPhoto.length`:
   * a photo that threw contributes an empty detection array, so counting the array would
   * report a failed scan as a clean one.
   */
  photosAssessed: number;
  status: "complete" | "partial";
}

export function conditionFromDetections(
  perPhoto: Detection[][],
  binding: ConditionBinding,
): ClientCondition {
  // Aggregate per class, tracking each detection's pixel-graded severity + impact, so the score
  // reflects how bad the damage actually is — not merely how many boxes fired or how big they are.
  interface Slot {
    maxConf: number;
    photos: Set<number>;
    dets: { sev: number; conf: number; impact: number }[];
    worstSev: number;
  }
  const perClass = new Map<DamageClass, Slot>();
  perPhoto.forEach((dets, photoIdx) => {
    for (const d of dets) {
      if (!(d.label in BASE_SEVERITY) || d.confidence < TILE_CONF) continue;
      const sev = sevOfDet(d);
      const slot = perClass.get(d.label) ?? { maxConf: 0, photos: new Set<number>(), dets: [], worstSev: 0 };
      slot.maxConf = Math.max(slot.maxConf, d.confidence);
      slot.photos.add(photoIdx);
      slot.dets.push({ sev, conf: d.confidence, impact: detImpact(d.label, sev, d.confidence) });
      slot.worstSev = Math.max(slot.worstSev, sev);
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
      severity: severityOf(label, s.worstSev),
    });
  }

  // How much of the car is covered by damage — the label-agnostic "extent" signal.
  let maxCoverage = 0;
  for (const dets of perPhoto) {
    const kept = dets.filter((d) => d.label in BASE_SEVERITY && d.confidence >= TILE_CONF);
    maxCoverage = Math.max(maxCoverage, damageCoverage(kept));
  }

  // Escalations. (1) Accident: co-occurring STRUCTURAL findings signal a collision (crack + glass
  // + lamp + missing_part together). (2) Extent: damage spread across a large AREA is major damage
  // even when the model only calls it "dent" — this is what stops a crushed side reading as "minor".
  let deduction = 1 - keptAll;
  if (structHits >= 2) deduction = 1 - Math.pow(1 - deduction, 1 + STRUCT_ESC * (structHits - 1));
  if (maxCoverage > EXTENT_KNEE) deduction = 1 - Math.pow(1 - deduction, 1 + EXTENT_ESC * (maxCoverage - EXTENT_KNEE));
  deduction = Math.min(MAX_TOTAL_DEDUCTION, deduction);

  // Extensive coverage ⇒ the worst finding IS severe, whatever the fine label says (honest UI +
  // triggers the inspection prompt). Scratch/glass stay capped — they're cheap regardless of area.
  if (maxCoverage >= EXTENT_SEVERE_COV && findings.length > 0
      && findings[0].damage_type !== "scratch" && findings[0].damage_type !== "glass_shatter") {
    findings[0].severity = "severe";
  }

  // Structural-finding floor: a detected moderate/severe crack/impact can't leave the car looking
  // "Excellent" just because its box was small. glass_shatter is excluded — it's genuinely cheap.
  const structFindings = findings.filter(
    (f) => STRUCTURAL.has(f.damage_type) && f.damage_type !== "glass_shatter");
  if (structFindings.some((f) => f.severity === "severe")) deduction = Math.max(deduction, STRUCT_SEV_FLOOR);
  else if (structFindings.some((f) => f.severity === "moderate")) deduction = Math.max(deduction, STRUCT_MOD_FLOOR);
  deduction = Math.min(MAX_TOTAL_DEDUCTION, deduction);

  const score = Math.round(100 * (1 - deduction));
  const hasModeratePlus = findings.some((f) => f.severity !== "minor");
  // Any structural finding warrants a physical check — a crack/impact can hide damage behind the
  // panel — even if the numeric score is high. A scan that found NOTHING also warrants one: the
  // detector's measured recall is 0.690 (dent 0.525, crack 0.389), so "no detections" is
  // unconfirmed rather than clean, and a wrecked car reading 100/100 is exactly that failure.
  const foundNothing = findings.length === 0;
  const needsInspection = score < 70 || hasModeratePlus || structFindings.length > 0 || foundNothing;
  return {
    cv_available: true,
    condition_score: score,
    price_adjustment_factor: Math.round((1 - deduction) * 1e4) / 1e4,
    findings,
    photos_assessed: binding.photosAssessed,
    total_value_impact_pct: Math.round(deduction * 100 * 10) / 10,
    source: "browser",
    assessment: assessmentBand(score, hasModeratePlus),
    // A partial scan always warrants inspection: the photos we couldn't read are exactly
    // the ones we can say nothing about, so we must not imply the car is clean.
    needs_inspection: needsInspection || binding.status === "partial",
    photo_set_hash: binding.photoSetHash,
    model_version: MODEL_VERSION,
    preprocessing_version: PREPROCESSING_VERSION,
    inference_config_version: INFERENCE_CONFIG_VERSION,
    status: binding.status,
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
