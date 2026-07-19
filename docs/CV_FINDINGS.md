# CV workflow audit — findings

Audit of the vehicle-damage workflow against commit `5ecf228` (branch `main`, clean tree).

Every claim below is labelled with how it was established. Nothing here is inferred from
documentation — where docs and code disagree, the code and the generated artifacts win, and
the disagreement is itself reported.

| Label | Meaning |
|---|---|
| **[code]** | read directly from the checked-out source |
| **[runtime]** | observed by executing something |
| **[artifact]** | read from the ONNX file or a committed report |
| **[dataset]** | would require the dataset — **not possible from this repo** |

---

## 0. Baseline

Regenerate with `python scripts/cv_baseline.py`; committed at `eval/cv_baseline.json`.

| | |
|---|---|
| Commit / branch / tree | `5ecf2286d26a8c72d5af8ef3a860b4e27a5c2506` / `main` / clean |
| Runtimes | Node 22.21.0, npm 10.8.2, Python 3.12.10 |
| Model SHA-256 (both copies, **identical**) | `49ac00450513af13a9ea13c3fe90e6f40072cf693a54795c39ac9efcb94400c2` |
| ONNX | Ultralytics 8.4.95, opset 12, `nms=False`, in `float32[1,3,640,640]`, out `float32[1,12,8400]` |
| Class list (from the model's own metadata) | `dent, scratch, crack, glass_shatter, lamp_broken, tire_flat, punctured, missing_part` |
| Eval report hashes | `cv_eval_report.json` `248bfe46…`, `cv_train_summary.json` `d21106c7…` |

**ONNX Runtime version is not one thing** **[code]** — three coexisted: `onnxruntime-web`
`^1.27.0` (browser, *floating*), `onnxruntime==1.20.1` (cv-service, pinned), 1.24.4 (this
machine). A floating range means the inference engine was not fixed by any evaluation.
*Fixed:* pinned to `1.27.0` exactly.

---

## 1. The reported nondeterminism was never the model

**[runtime]** The ONNX is **bitwise deterministic**: 50 consecutive runs on identical input
(CPU EP, ORT 1.24.4) produced one distinct output hash, max abs diff `0.0`, and a fresh
session reproduced the first byte for byte.

This isolates "the same photos give different answers" to the application layer, and it did:
the condition was independent state that nothing invalidated (§2). Retraining would not have
fixed a single reported symptom.

---

## 2. Defects found and fixed

All were confirmed **[code]** before being changed, and each now has a regression test.

| # | Defect | Root cause |
|---|---|---|
| 1 | **Photos were uploaded** on every valuation despite "photos never leave your device" | `toApiVehicle` removed only `asking_price_aed` and forwarded the rest. Omission-based filtering fails open. |
| 2 | **A stale condition could be priced** — submitting mid-rescan applied the *previous* photo set's damage to new photos | `photos` and `clientCondition` were independent state; the condition was only cleared when the set became empty |
| 3 | **A failed scan looked like a clean car** (both: zero findings, 100/100) | a decode failure pushed `[]` and still counted toward `photos_assessed` |
| 4 | **Confidence drove repair cost** — `conf >= 0.75` ⇒ 1.6× | `repair_cost._severity` re-derived severity from confidence and overrode the pixel grade; `orchestrator` dropped `severity` on the way in, so on the browser path this was the *only* severity source |
| 5 | **A redeployed model could never reach users** | fixed URL + `immutable, max-age=31536000` + cache-first-forever SW |
| 6 | **Boxes were misaligned** on any non-square photo | overlay percentages positioned against a square `object-cover` container |
| 7 | **Photo order was decode order** | one `FileReader` per file, each appending from its own `onload` |
| 8 | **A third detector** could silently disagree | `cv-service/app.py` had no tiling/WBF/severity/`TILE_EXCLUDE`/`GLASS_CONF`/area filter |
| 9 | **Sliders and fixtures posed as real scans** | what-if and demo-garage built conditions with `source: "browser"` |
| 10 | **CV errors were silent** | bare `except Exception: continue`, no logging |

**Why #1 and #2 mattered most.** #1 falsified a claim made in seven user-facing places, one
of which calls it "a genuine privacy guarantee, not a privacy policy". #2 silently changed
the price of a car.

Fixes are structural rather than new guards: the scan is now an immutable job **derived from
the photos** (`frontend/lib/cv/scan-job.ts`), so a condition cannot outlive its photo set;
and the wire payload is an explicit allowlist, so a new private field is never sent by
default.

### Provenance now carried

Every condition declares `photo_set_hash` (SHA-256 over the ordered per-photo byte hashes),
`model_version` (SHA-256[:12] of the `.onnx`, generated at build), `preprocessing_version`,
`inference_config_version`, `status` (`complete`/`partial`) and `source`
(`browser`/`synthetic`) — so a finding traces back to a specific image + model + output.

---

## 3. Browser and backend are NOT equivalent — OPEN

**[code]** Seven confirmed divergences; full table in `docs/CV_INFERENCE_SPEC.md` §6. The
ones that change results most:

- **The backend has no minimum-box-area filter at all** (browser drops `< 0.0008`).
- **EXIF**: browsers auto-rotate for both `<img>` and `drawImage`; PIL does not. The same
  phone photo is a different image on the two paths.
- Confidence gate `>` before NMS (backend) vs `>=` after NMS (browser).
- Severity crop grayscales-then-resizes (backend) vs resizes-then-grayscales (browser).

**Any claim of browser/backend parity is currently unsupported.** This is latent in
production (the browser serves all users; the backend path runs only for direct photo POSTs)
but it is real. Closing it needs shared post-processing or agreed tolerances plus conformance
vectors — neither exists.

---

## 4. The evaluation is not scientifically valid — OPEN

Not fixed: the dataset (~5.25 GB, CarDD + VehiDE) lives on Kaggle, `best.pt` is gitignored,
and the notebooks hardcode `/kaggle/` paths. **None of this is reproducible from a clone**,
so the numbers can be neither reproduced nor falsified here. **[dataset]**

### 4.1 The headline 0.732 is not a held-out score **[artifact]**

`eval/cv_eval_report.json` records `eval_split: "held-out deterministic half of val (607
images)"`. That half was carved from the **validation set used for early stopping and
checkpoint selection** (`notebooks/02`: `patience=10`, then loads `weights/best.pt`). The
images were never trained on, but they *selected the model*. That is model-selection
leakage: it is a val split, not a test split.

Worse, **CarDD ships a real test split and `notebooks/01` folded it into val**
(`copy_cardd("test", "val")`) before `notebooks/03` re-split by filename hash. An
uncontaminated test set existed and was discarded.

### 4.2 "No overfitting" is a tautology **[artifact]**

`docs/ARCHITECTURE.md` argued: held-out (0.732) matches training (0.732) ⇒ generalises. Both
numbers are **val** numbers — 0.7322 on full val vs 0.7323 on half of that same val.
Agreeing to four decimals is arithmetic, not evidence. It says nothing about generalisation.

### 4.3 Two of eight classes were never evaluated **[artifact]**

`cv_eval_report.json` `per_class` contains six: `dent, scratch, crack, glass_shatter,
lamp_broken, tire_flat`. **`punctured` and `missing_part` have no measured precision or
recall anywhere** — while carrying the product's **largest** price deductions
(`BASE_SEVERITY` 0.16 and 0.28, vs `scratch` 0.03). The public model card renders six bars
under an eight-class story. No document discloses this.

### 4.4 The metrics were measured on `best.pt`, not the shipped ONNX **[artifact]**

`notebooks/03` evaluates the PyTorch checkpoint. The `onnx_parity` block compares a pre-NMS
candidate count against an NMS'd box count on 5 images and **asserts nothing** — it cannot
fail. Nothing establishes that the shipped `best.onnx` scores 0.732.

### 4.5 Claims contradicted by their own code **[code]**

| Claim | Reality |
|---|---|
| `cv_train_summary.json`: `"epochs_requested": 60` | `notebooks/02` cell 5 runs `epochs=30, patience=10`; cell 4's prose says "60 epochs with `patience=15`". Three sources, three answers; the JSON records the one the code does not do. **Left as-is — the true value is unknowable without a run log.** |
| "~18k images" (README, both presentation scripts) | `14,437 + 1,184 = **15,621**` — overstated ~15% |
| "Verified counts from the successful run" | no run artifact exists; **every notebook has zero stored outputs** |
| "strictly held-out … never trained on" | contradicted by `notebooks/03`'s own admission (§4.1) |
| "0.732 already beats the published benchmarks" | not comparable: published CarDD SOTA is on CarDD's *test* split; 0.732 is on a CarDD+VehiDE val subset with CarDD's test folded in |
| `RESEARCH.md` int8/fp16 quantization table | **no generating code anywhere** — no `quantize_dynamic` call exists |
| `eval/README.md` cites `cv_map_eval.py`, `ragas_eval.py` | neither file exists |

### 4.6 Thresholds were never tuned **[code]**

Every threshold is a hand-set literal with a prose justification and no experiment. No
script derives them; none was tuned on any split. Notably `cv-browser.ts` down-weights
`glass_shatter` as "the model's most FP-prone class" while `cv_eval_report.json` records it
as the **highest-precision** class (0.9816) — a real-world correction to a metric that says
the opposite. That is a strong hint the eval set does not reflect deployment, and it is
disclosed nowhere.

### 4.7 No CI check could catch any of this **[code]**

`.github/workflows/evals.yml` runs three tabular/retrieval scripts. **No CV.** Its path
filters don't even watch the model or the notebooks. The only CV assertion in the repo was
"the file exists and loads" — it would pass on randomly-initialised weights.
*Partly addressed:* `eval/unit_tests.py` now asserts the code's class order against the ONNX
metadata, and pins the confidence-is-not-severity contract.

### 4.8 Credit where due

The **tabular** side is genuinely rigorous — seeded 60/20/20 splits, calibration and test
never sharing rows, 20-seed averaging, a publicly retracted result that "does not replicate
and was split noise", and a tuning study that reports its own tuned config *losing*.
`RESEARCH.md` also candidly flags its own unmeasured claims. The CV side's lack of the same
discipline is conspicuous rather than accidental — and the CV metrics that *are* reported
are faithfully transcribed from the JSON. The dishonesty is in the **interpretation**, not
in fabricated numbers.

---

## 5. Also worth knowing

- **Licensing** **[artifact]**: the model's own metadata declares **AGPL-3.0** (Ultralytics).
  The repo has **no LICENSE file**. AGPL has strong implications for a hosted commercial
  product. Resolve before any commercial use.
- **`client_condition` is forgeable** **[code]**: `orchestrator` only checks `cv_available`
  truthiness, so a POST with `photos: []` and a hand-written condition is accepted. Bounded
  by `price_adjustment_factor >= 0.38`, so a price can only be *deflated* — to 38%, with no
  photos. Now detectable (the condition declares its photo-set hash and model version) but
  **not yet enforced server-side**.
- **`/valuate` and `/estimate` can disagree** **[code]**: `main.py` allows a factor down to
  0.38 while `orchestrator.estimate` re-clamps to 0.5 — so a factor of 0.40 yields two
  different prices for the same car, from two endpoints documented to agree. **Open.**
- **`damage_type` is unvalidated free text** **[code]** (`max_length=40`); the class list is
  used only for `len()`. Unknown classes are silently skipped in pricing. **Open.**
- **No LLM can touch detections** **[code]** — verified. The graph's node/state design means
  the report node writes only `report`. This part is sound.

---

## 6. What I recommend next

1. **Re-measure on a genuinely held-out split** — restore CarDD's own test split, evaluate
   **the exported ONNX**, and publish per-class numbers for all eight classes. Until then do
   not quote 0.732 as a test or SOTA-comparable number.
2. **Either evaluate `punctured`/`missing_part` or stop pricing them** at the largest
   deductions in the product.
3. **Record model provenance** — the training run, its config, and the ONNX hash — the way
   the valuation model already does.
4. **Close the browser/backend divergences** (§3) or drop the parity claim.
5. **Enforce the binding server-side**: reject a `client_condition` whose `model_version` is
   unrecognised or whose `photo_set_hash` doesn't match the request.
6. **Correct the false doc claims** (§4.5) — some are done; the presentation scripts still
   say "held-out test set" and "eighteen thousand".

---

## Framing instability — the dominant error source (measured 2026-07-19)

**Symptom reported by a user:** "the score keeps changing for the same photo."

**It is not non-determinism.** Identical bytes give an identical score: `scripts/cv-determinism-run.mjs`
proves the pure-JS preprocessing path is byte-stable, and 10 repeat runs of the full detector on
one file return one detection set and one score. That was a real bug (a GPU canvas resampler) and
it is fixed.

**It is the model.** Its detections depend heavily on how the car is framed. Same car, same
damage, imperceptibly different photos (`scripts/stability_check.py`):

| framing | score | classes reported |
|---|---|---|
| original | 38 | crack, missing_part |
| crop 3% | **85** | crack |
| crop 6% | 62 | crack |
| crop 10% | 78 | missing_part |
| stood back 10% | **85** | dent, lamp_broken |
| resize 70% | **85** | lamp_broken |

**Range: 47 points from a 3% crop.** Critically, the reported CLASS flips — `missing_part`
(BASE_SEVERITY 0.28) becomes `lamp_broken` (0.07), a 4× severity difference. The score therefore
inherits the model's confusion about *what* the damage is, not merely how confident it is. This
dominates every other error source in the pipeline, including the thresholds and the scoring
formula.

### Four post-processing fixes were tried and all failed

Do not re-attempt these without new evidence:

1. **Multi-scale fusion** (extra zoom passes fused by WBF) — range 47 → 47, stdev 16.0 → **18.6
   (worse)**. Fusing more unstable views adds noise rather than averaging it out.
2. **Softening the confidence gate** (0.20 gate / 0.35 floor → 0.10 / 0.05) — range 47 → 47. The
   cliff is not the mechanism.
3. **Threshold tuning** — trades a false negative for a false positive; never fixes both (this is
   how the wreck-reads-100 and clean-car-reads-38 bugs were originally created).
4. **Scoring on coverage instead of class labels** — coverage is itself unstable, ranging
   0.022–0.152 (7×) across the same variations.

### Conclusion

This is **not fixable downstream**. The detections themselves are unstable and everything after
them inherits it. The fix is retraining on in-domain (UAE, whole-car) photos — the model was
trained on CarDD/VehiDE close-up damage crops, which is exactly why its confidence collapses on
the wide shots users actually upload.

`scripts/stability_check.py` exists to **measure** that a retrained model is genuinely better,
rather than trusting a single-photo demo. It exits non-zero above a 15-point range, so it can
become a gate once a retrained model can pass it.
