# Architecture & Evaluation Results

Single source of truth for every number quoted in the README and the Phase 11 deck.
Numbers here are **real and honestly reported** — held-out where applicable, never training-set.

---

## Data foundations (real, no synthetic data)

### Computer vision — CarDD + VehiDE, unified to one YOLO dataset
Prepared by `notebooks/01_cv_data_prep.ipynb` on Kaggle. Verified counts from the successful run:

| | value |
|---|---|
| Train images | 14,437 |
| Val images | 1,184 |
| Unified classes | 8 — `dent, scratch, crack, glass_shatter, lamp_broken, tire_flat, punctured, missing_part` |
| Sources | CarDD (YOLO, 6 classes) + VehiDE (VIA polygons, 7 classes) merged, nothing dropped |

### Tabular valuation — real Dubizzle UAE listings
Scraped July 2026 (Apify `agenscrape/dubizzle-uae-scraper`); cleaned by `data/prepare_tabular.py`.
The originally-named Kaggle dataset was **rejected as synthetic** (DECISIONS.md ADR-011).

| | value |
|---|---|
| Clean rows | 672 |
| Makes / models | 37 / 187 |
| Cities | Dubai 527, Abu Dhabi 145 |
| Price median | AED 74,925 |
| Mileage median | 77,288 km |
| Real-market signature | corr(log price, age) = **−0.53**, corr(log price, mileage) = **−0.53** |

---

## Valuation model (XGBoost quantile regression + SHAP)

`notebooks/05` → `backend-api/models/valuation_model.joblib`. Metrics: `eval/valuation_metrics.json`.
5-fold cross-validated, shuffled, seed 42 — **held-out folds only**.

| metric | value |
|---|---|
| Median absolute % error | **19.6%** |
| Mean absolute % error (MAPE) | 27.5% |
| MAE | AED 39,717 |
| RMSE | AED 118,641 (inflated by luxury tail to AED 2.17M) |
| Naive make+model-median baseline MAE | AED 55,483 |
| **Improvement over baseline** | **28.4%** |
| **Honest** held-out interval coverage (split-conformal) | **0.776** (avg of 5 leakage-free splits; target 0.80) |
| Conformal half-width (log) | 0.442 → band ≈ ×1.56 / ÷1.56 around mid |

**Why conformal (audit-fixed):** the interval width is set on a **separate calibration split** and its
coverage is measured on a **truly held-out test set** (averaged over 5 leakage-free 60/20/20 splits). An
earlier version computed coverage on the same residuals used to set the width — tautological. The honest
out-of-sample coverage is **0.776**: the interval covers ~78% of unseen cars, close to the 80% target and
reported without inflation. It tightens with more data. `year` was dropped (perfectly collinear with `age`).

### SHAP explainability (`notebooks/06`, `eval/shap_report.json`)
Top global drivers (mean |SHAP|): engine cylinders, age, mileage, make, body type.
**Directional sanity checks — all pass:**

| feature | SHAP correlation | expected | pass |
|---|---|---|---|
| mileage | −0.86 | negative | ✅ |
| age | −0.92 | negative | ✅ |

(`year` was dropped — it is perfectly collinear with `age`, which was destabilising the SHAP attribution.)

The model priced on sound economics, not spurious correlations.

---

## CV detector (YOLOv8-small) — trained, evaluated

Fine-tuned on Kaggle P100 (`notebooks/02`) and evaluated on a **strictly held-out** split
(`notebooks/03`, 607 images the model never trained on). Results: `eval/cv_eval_report.json`.

| metric | held-out value |
|---|---|
| **mAP@0.5** | **0.732** |
| mAP@0.5:0.95 | 0.579 |
| Mean precision | 0.758 |
| Mean recall | 0.690 |

Per-class mAP@0.5: `glass_shatter` **0.98**, `lamp_broken`/`tire_flat` strong, `dent` 0.58,
`scratch` 0.57, `crack` 0.43 (honestly the hardest — thin, low-contrast). Held-out (0.732) matches
training (0.732), so the detector **generalises cleanly, no overfitting**. Exported to ONNX
(`cv-service/model/best.onnx`); runs in-process (onnxruntime, no torch) via `agents/cv_local.py`
when `ENABLE_LOCAL_CV=1`, or on the HF Docker Space. Verified end-to-end: a real CarDD photo →
`tire_flat` @0.85 → condition score → price adjustment.

---

## Comparables RAG (Phase 5)

`backend-api/agents/comparables_rag_agent.py` — hybrid dense (MiniLM) + BM25 + structured
similarity + cross-encoder rerank over the 672 real listings. Validated (`eval/comparables_eval.json`):

| metric | value |
|---|---|
| Mean same-make precision@5 | **1.00** |
| Queries with exact-model match | 5 / 6 |
| Backend (local) | committed 1 MB joblib artifact — no external service needed |
| Backend (production) | Supabase pgvector (schema + idempotent loader ready) |

Every comparable returns its real `listing_id` + source `url` → direct citation grounding for the report agent.

---

## Orchestration API (Phase 6)

FastAPI + LangGraph `StateGraph` on Render. Seven nodes, each streamed to the UI via SSE:
**Intake → Aggregation (CV) → Valuation → Comparables → Report → Verifier → Confidence.**

- **LLM client:** `google-genai` Gemini Flash → Groq Llama 3.3 fallback → deterministic template
  (pipeline runs end-to-end before any key exists; template report is citation-correct by construction).
- **Verifier gate (deterministic, no LLM):** parses every AED figure, %, and `[citation]` in the report;
  fails any ungrounded number. Verified end-to-end: a real report passed with **13 numbers / 14 citations,
  all grounded**; an invalid payload is rejected at intake.
- **Confidence disclosure (Section 15):** states interval width + per-damage CV confidence, and recommends
  professional inspection when confidence is limited or no visual assessment ran.
- **Endpoints:** `GET /health`, `POST /valuate`, `POST /valuate/stream` (SSE). Tested via TestClient.
- **Free-tier note (ADR-014):** torch-heavy comparables stack exceeds Render's 512 MB; production swaps the
  query embedder to ONNX + Supabase pgvector (Phase 10).

---

## Integration & E2E testing (Phase 8)

Three suites under `eval/`, all green (`eval/run_all.sh`):

| Suite | Checks | Result |
|---|---|---|
| `unit_tests.py` — agent + **adversarial** guardrails | 15 | ✅ all pass |
| `api_integration_test.py` — HTTP contract (REST + SSE) the frontend uses | 20 | ✅ all pass |
| `e2e_test.py` — 18 fixed real UAE vehicles through the full graph | 18 | ✅ 18/18, 0.84 s/case |

**Adversarial highlights (the honesty guarantee, proven):** the Verifier catches an injected
ungrounded `AED 999,999`, a citation to non-existent evidence `[Z9]`, and an ungrounded percentage —
and intake rejects malformed input. Benchmark spans common cars, luxury, and edge cases (unseen make,
2007 model, 240k km, electric) — every case produces an ordered price range, 5 comparables, a
citation-grounded report that **passes the Verifier**, and a confidence disclosure, with no errors.
Benchmark set: `eval/benchmark_cases.json`; results: `eval/e2e_report.json`.

---

## Report faithfulness & guardrails (Phase 9)

### Faithfulness (`eval/faithfulness_eval.py` → `eval/faithfulness_report.json`)
Ragas' faithfulness decomposes an answer into atomic claims and checks context support. Here every
report claim is a **number or a citation**, which is machine-checkable — so faithfulness is computed
**deterministically** (no LLM self-grading), the stronger guarantee for a valuation product. The
`report_agent` still uses the live Gemini→Groq LLM when keys are set; this same metric grades whatever
writer produced the text, and the Verifier gate enforces the target at serve time.

| metric | value (over 18 benchmark reports) | target |
|---|---|---|
| Mean faithfulness | **1.000** | ≥ 0.90 |
| Min faithfulness | **1.000** | ≥ 0.90 |
| Mean citation validity | **1.000** | — |
| Mean relevancy | **1.000** | — |
| **Negative control** (deliberately hallucinated report) | faithfulness **0.000**, cite-validity 0.50 | must be < 0.90 |

The negative control proves the metric discriminates — it is not trivially 1.0. Combined with the
adversarial unit tests (the Verifier catches injected fake figures), the citation-grounding guarantee
is demonstrably real, not asserted.

### Confidence-disclosure contract — Section 15 (`eval/guardrails_test.py` → `eval/guardrails_report.json`)
Enforced as a test over all 18 cases: **90 checks, 0 failures.** Every report states (a) per-damage CV
confidence when available, else an honest "no visual assessment" note; (b) the valuation
prediction-interval width; (c) a professional-inspection recommendation whenever confidence is limited;
and never claims to be a certified appraisal. Confidence tiers use a data-support signal (comparable
quality + make familiarity + interval width + visual assessment), so they differentiate honestly:

| tier | count (18 benchmark, no photos) | meaning |
|---|---|---|
| high | 0 | needs a visual assessment (CV Space) — impossible without photos |
| medium | 16 | strong comparable support, but no visual scan |
| low | 2 | thin comparables (the Tesla + Porsche edge cases) |

Run everything with `eval/run_all.sh` (5 suites, ~90 checks + 18 E2E, all green).

---

## Report faithfulness (Ragas library) — _optional live-LLM pass_
When `GEMINI_API_KEY`/`GROQ_API_KEY` are configured, the report is LLM-written and the deterministic
faithfulness metric above grades it directly. A full Ragas-library LLM-judge pass can be added as a
secondary check, but is not required — the machine-checkable metric is authoritative here.
