# CV Inference Specification

**Version 1.0.0** · applies to `preprocessing_version` / `inference_config_version` `1.0.0`

The single definition of "the detector". Every implementation must conform to this document
and declare the version it implements. Where this document and the code disagree, **the code
is the source of truth and this document is a bug** — fix the document, or fix the code to
match and say so here.

Values below were read from the implementations and from the ONNX artifact's own metadata,
not from prose. Regenerate the artifact facts with `python scripts/cv_baseline.py`.

## 1. Implementations

| Path | File | When it runs |
|---|---|---|
| Browser (production) | `frontend/lib/cv-browser.ts` | every user scan; photos never leave the device |
| Server-side | `backend-api/agents/cv_local.py` | only for callers that POST photos with no `client_condition` |

A third implementation (`cv-service/app.py`) was **removed** — it lacked tiling, WBF, the
severity head, `TILE_EXCLUDE`, `GLASS_CONF` and the area filter, so it silently disagreed
with both. See `cv-service/README.md`. **Do not add a third implementation.**

## 2. Model artifact

Read from the ONNX metadata, which outranks any documentation:

| Property | Value |
|---|---|
| SHA-256 | `49ac00450513af13a9ea13c3fe90e6f40072cf693a54795c39ac9efcb94400c2` |
| Producer | Ultralytics 8.4.95 (`task=detect`, `head=Detect`) |
| Opset / dynamic / built-in NMS | 12 / `False` / `nms=False` (decode + NMS are ours) |
| Input | `images` — `float32[1,3,640,640]`, NCHW, RGB |
| Output | `output0` — `float32[1,12,8400]` = 4 box + 8 class scores |
| Exported | 2026-07-14 |
| License | AGPL-3.0 (Ultralytics) — **the repo has no LICENSE file; escalated in [`docs/LICENSING.md`](LICENSING.md), unresolved** |

Both copies (`frontend/public/models/best.onnx`, `cv-service/model/best.onnx`) are
byte-identical; `scripts/cv_baseline.py` asserts this.

### Class order — normative

    0 dent   1 scratch   2 crack   3 glass_shatter
    4 lamp_broken   5 tire_flat   6 punctured   7 missing_part

This is the order **in the model's own metadata**. `eval/unit_tests.py` asserts the code's
list against the artifact rather than against another copy of itself: a silent reorder would
remap every detection (a dent priced as a missing part) while every threshold still looked
correct.

## 3. Pipeline

### 3.1 Decode and orientation

1. Decode to RGB. Alpha is discarded (canvas/PIL composite; no un-premultiply).
2. **Orientation: browser-default.** Neither implementation normalizes EXIF explicitly.
   Browsers apply EXIF to `<img>` and to `drawImage`, so display and model input agree
   there; PIL does **not** auto-rotate, so `cv_local` sees unrotated pixels for the same
   file. See §6 — this is an open divergence, not a specified behaviour.

### 3.2 Letterbox

| Parameter | Value |
|---|---|
| Target | 640 × 640 |
| Scale | `ratio = 640 / max(w, h)` (aspect preserved, no upscale distortion) |
| Alignment | **top-left** (not centred) |
| Pad value | RGB(114, 114, 114) |

Top-left alignment is load-bearing: undoing it is a divide by `ratio` with **no offset
term**. A centred letterbox would need `(x - padX) / ratio` and silently shift every box.

### 3.3 Normalization and layout

`value / 255.0` → float32. No mean/std. Layout NCHW, planar RGB.

### 3.4 Decode of `output0`

Transpose to `(8400, 12)`. Columns 0-3 = `cx, cy, w, h` (in 640-space); columns 4-11 = class
scores. Per row: `class = argmax(scores)`, `confidence = max(scores)`. Convert to corners:
`x1 = cx - w/2`, `y1 = cy - h/2`, `x2 = cx + w/2`, `y2 = cy + h/2`.

### 3.5 Thresholds

| Constant | Value | Meaning |
|---|---|---|
| `DECODE_FLOOR` | 0.20 | browser: keep candidates above this at decode; per-pass gate applied after NMS |
| `CONF_THRES` | 0.35 | full-frame pass gate |
| `TILE_CONF` | 0.33 | tile pass gate; also the per-detection floor in aggregation |
| `IOU_THRES` | 0.45 | per-class NMS |
| `WBF_IOU` | 0.55 | Weighted Box Fusion |
| `AGREE_BONUS` | 0.05 | per extra agreeing box; fused conf capped at 0.98 |
| `MIN_AREA` | 0.0008 | minimum box area as a fraction of frame |
| `GLASS_CONF` | 0.55 | `glass_shatter`-only final gate |

**Comparison direction is normative:** `>= minConf`, applied **after** NMS, on both paths.
The backend previously gated `> min_conf` *before* NMS; it now decodes above `DECODE_FLOOR`,
runs NMS, then gates `>= min_conf` — matching the browser (was §6 #2, now closed).

> These thresholds are **hand-set**, with no tuning experiment behind them. No script in the
> repo derives them and none was tuned on a split. Treat them as engineering judgement, not
> as measured optima. In particular `cv-browser.ts` justifies down-weighting `glass_shatter`
> as "the model's most FP-prone class" while `eval/cv_eval_report.json` records it as the
> **highest-precision** class (0.9816) — a real-world correction to a metric that says the
> opposite, which is itself evidence the eval set doesn't reflect deployment (§7).

### 3.6 Tiling — four passes

    [0, 0,   1,   1  ]   full frame
    [0, 0,   1,   0.6]   upper region (roof, glass, upper panels)
    [0, 0.4, 0.6, 1  ]   lower-left
    [0.4, 0.4, 1, 1  ]   lower-right

Each pass letterboxes its crop independently and runs inference. Boxes remap to full-frame
normalized coordinates as `(sx + x * sw) / W`.

`TILE_EXCLUDE = {glass_shatter}` — accepted from the full-frame pass **only**. Windshield
reflections fire hardest in crops.

### 3.7 Fusion and filtering, in order

1. Per-class NMS within each pass (`IOU_THRES`).
2. Per-pass confidence gate (`CONF_THRES` full, `TILE_CONF` tiles).
3. Weighted Box Fusion across passes (`WBF_IOU`): confidence-weighted box average;
   `fused = min(0.98, max(confs) + AGREE_BONUS * (n - 1))`.
4. Drop tile-sourced `glass_shatter` (`TILE_EXCLUDE`).
5. Drop boxes with area `< MIN_AREA`.
6. Drop `glass_shatter` with confidence `< GLASS_CONF`.

### 3.8 Severity — pixel-graded, never confidence

Severity is graded from the crop's pixels: 48×48 grayscale → central-difference gradient
magnitude, dark fraction (`g < 0.18`), and extent.

    sev = min(1, 0.42·min(1, area/0.14) + 0.34·min(1, grad/0.16) + 0.24·min(1, dark/0.45) + class_prior)

Class priors: `glass_shatter 0.15, missing_part 0.20, punctured 0.15, crack 0.10, lamp_broken 0.08`.

Bands: `>= 0.62` severe, `>= 0.34` moderate, else minor. `scratch` and `glass_shatter` are
capped at moderate (a windshield is cheap; reflections are FP-prone).

> **Confidence is not severity and must never be used as one.** Confidence answers "is this a
> scratch?", not "how bad is it?" A crisp, well-lit, trivial scratch scores high confidence;
> a faint deep gouge scores low. `repair_cost._severity` and `repair-estimate.tsx` previously
> returned `severe` at `conf >= 0.75`, applying a 1.6× cost multiplier keyed on model
> certainty — and overriding the pixel grade, re-escalating exactly the two classes that are
> deliberately capped. Both now consume the pixel grade and fall back to extent only.
> Confidence's only legitimate role is the impact **weight** in aggregation (§3.9).

### 3.9 Aggregation

Per detection: `impact = BASE_SEVERITY[class] × (0.5 + 2.0·sev) × eff_weight(conf, sev)`,
where `conf_weight = clamp((conf − 0.20) / 0.35, 0.35, 1)` and
`eff_weight = min(1, cw + (1 − cw)·sev·0.65)`.

Combine as a probabilistic union — `kept = Π(1 − impact)` — so damage saturates instead of
summing past 100%. Two escalations then apply (config version 1.1.0):
1. **Structural co-occurrence** — if two or more structural findings co-occur
   (`crack, glass_shatter, lamp_broken, punctured, missing_part, tire_flat`):
   `deduction = 1 − (1 − deduction)^(1 + 0.4·(structHits − 1))`.
2. **Damage extent** — `coverage` = the union fraction of the frame covered by damage boxes
   (grid-rasterized, `COV_GRID=48`). Above `EXTENT_KNEE=0.10`:
   `deduction = 1 − (1 − deduction)^(1 + 12·(coverage − 0.10))`. This is label-agnostic: the model
   often labels a whole crushed side as a few `dent` boxes, and cosmetic dents alone can only
   deduct ~30%, so extensive coverage is the signal that a car is a major-damage car regardless of
   the fine label. At `coverage ≥ 0.20` the worst finding is reported as `severe`. Tuned in
   `scratch/tune_extent.py`; guarded by `eval/cv_scoring.py` (bands + browser/backend parity).

Cap at `MAX_TOTAL_DEDUCTION = 0.62`. `condition_score = round(100 · (1 − deduction))`.

Only photos that actually decoded **and** completed inference are aggregated;
`photos_assessed` counts those, never the number submitted.

### 3.10 Output ordering

Canonical order for hashing and comparison:

    class_id ASC, confidence DESC, x1, y1, x2, y2

Now applied in code on both paths (`cv-browser.fuseDetections`, `cv_local._fuse_detections`);
the browser previously sorted by confidence only. **No version bump for this**: the condition
score, factor, findings and provenance are all order-independent (aggregation is per-class), so
no existing condition becomes stale — the change makes the output match a rule this document
already declared normative. Flagged here so the call is reviewable.

## 4. Provenance contract

Every `ClientCondition` carries the identity of what produced it:

| Field | Meaning |
|---|---|
| `photo_set_hash` | SHA-256 over the ordered per-photo byte hashes (`lib/cv/hashes.ts`) |
| `model_version` | SHA-256[:12] of the `.onnx` — generated at build by `scripts/cv-version.mjs` |
| `preprocessing_version` / `inference_config_version` | this spec's version |
| `status` | `complete` \| `partial` — a partial scan is **not** a clean bill of health |
| `source` | `browser` (a real scan) \| `synthetic` (what-if sliders, demo fixtures — no detector ran) |

Bump `preprocessing_version` / `inference_config_version` **and** this document's version
together whenever any value in §3 changes. The same photo and weights can yield a different
result under a different config, so a stale condition must be detectable as stale.

Photos are never transmitted. `lib/api.toBackendRequest` builds the wire payload from an
explicit allowlist (`VEHICLE_ATTRIBUTE_KEYS`), so a new private field cannot leak by
default. Enforced by `frontend/tests/cv-scan.spec.ts`.

## 5. Cache and versioning

The model URL is content-addressed: `/models/best.onnx?v=<sha256[:12]>`. The ORT runtime is
served from `/ort/<ort-version>/` and pinned exactly (`onnxruntime-web: 1.27.0`, no `^`).
Both are required for the `immutable, max-age=31536000` header in `next.config.mjs` and the
cache-first branch in `sw.js` to be safe: under a fixed path, a redeployed model was
unreachable behind those caches forever.

A floating ORT range is a determinism defect, not a convenience — a different runtime build
can produce different floats from identical weights.

## 6. Known divergences

The shared **post-processing** (fusion + filter, §3.7 steps 3–6) is now conformance-tested:
`eval/cv_conformance.py` feeds identical synthetic per-tile detections to both
`cv_local._fuse_detections` (Python) and `cv-browser.fuseDetections` (TypeScript, via esbuild)
and asserts they agree — labels/counts/order exact, box coordinates within `1e-4`. The test
fails when they disagree (verified by disabling the backend area filter). The **preprocessing**
divergences remain: they feed the model different pixels, so the *detections* still differ, and
no post-processing can reconcile that.

| # | Divergence | Browser | Backend (`cv_local.py`) | Status |
|---|---|---|---|---|
| 1 | Minimum box area | drops `< 0.0008` | drops `< 0.0008` | **closed** — backend filter added |
| 2 | Confidence gate | `>=`, after NMS | `>=`, after NMS | **closed** — decode-floor + gate after NMS |
| 3 | Severity crop order | resize 48×48 then grayscale | resize 48×48 then grayscale | **closed** — backend order aligned |
| 5 | Crop coordinate rounding | `Math.round` | round-half-up (`int(v+0.5)`) | **closed** — backend rounds, not truncates |
| 4 | Resampler | pure-JS area-average (deterministic) | `cv2.resize` / `PIL.resize` | **OPEN (browser now self-consistent)** — still no shared native resampler vs the backend, but the browser no longer uses `ctx.drawImage` smoothing (GPU, not bit-stable), so the same photo now scans to the same tensor and score every time. Preprocessing bumped to 1.1.0. |
| 6 | Fused-box output rounding | unrounded | 4 dp | **OPEN (bounded)** — ≤ `5e-5`; the conformance tolerance |
| 7 | EXIF orientation | browser auto-applies | PIL does not rotate | **OPEN** — environmental; needs an explicit EXIF step |

Consequence: for a **direct photo POST to the backend**, the same phone photo can still produce
different detections than the browser would, because of #4 and #7 (different input pixels). This
is latent in production — the browser path serves all users; the backend path runs only for
direct photo POSTs. Closing #4/#7 requires an explicit shared resample + EXIF-normalize step (a
native dependency), not a post-processing change; #6 is bounded and covered by the tolerance.

## 7. What is NOT established about this model

Stated plainly so no reader infers more than the evidence supports:

- **The headline mAP@0.5 = 0.732 is not a held-out test score.** It was measured on a
  deterministic half of the *validation* set — the same set used for early stopping and
  checkpoint selection (`notebooks/02` `patience=10` → `best.pt`). CarDD's own genuine test
  split was folded into val by `notebooks/01` and then re-split by filename hash.
- **"Held-out matches training, so no overfitting" is a tautology**, not evidence: both
  numbers are val numbers (0.7322 on full val vs 0.7323 on half of it). Agreement to four
  decimals is what subsampling one population does.
- **2 of the 8 classes were never evaluated.** `punctured` and `missing_part` have no
  precision/recall in any report, yet carry the largest price deductions in the product
  (`BASE_SEVERITY` 0.16 and 0.28 vs `scratch` 0.03).
- **The reported metrics were measured on `best.pt`, not on the shipped ONNX.** The
  `onnx_parity` block in `eval/cv_eval_report.json` compares a pre-NMS candidate count to an
  NMS'd box count on 5 images and asserts nothing.
- **Nothing ties `best.onnx` to a training run** beyond its own export date. `best.pt` is
  gitignored, the notebooks have no stored outputs, and `ultralytics` was installed unpinned.
- The dataset (~5.25 GB, Kaggle) is not in the repo, so **none of this is reproducible from
  a clone** and no CI check can regress-test it.

Do not quote 0.732 as a test-set or SOTA-comparable number without re-measuring on a truly
held-out split — ideally CarDD's own — using the exported ONNX.
