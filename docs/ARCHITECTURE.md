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
| Mean absolute % error (MAPE) | 27.6% |
| MAE | AED 39,717 |
| RMSE | AED 118,641 (inflated by luxury tail to AED 2.17M) |
| Naive make+model-median baseline MAE | AED 55,483 |
| **Improvement over baseline** | **28.4%** |
| Calibrated 80% interval coverage (split-conformal) | **0.799** (target 0.80) |
| Conformal half-width (log) | 0.416 → band ≈ ×1.52 / ÷1.52 around mid |

**Why conformal:** raw quantile intervals under-covered (0.59) on 672 rows, which would make the
confidence disclosure dishonest. Split-conformal calibration on out-of-fold residuals restores true
80% coverage — the stated price range means what it says.

### SHAP explainability (`notebooks/06`, `eval/shap_report.json`)
Top global drivers (mean |SHAP|): engine cylinders, year, mileage, make, model, body type.
**Directional sanity checks — all pass:**

| feature | SHAP correlation | expected | pass |
|---|---|---|---|
| mileage | −0.86 | negative | ✅ |
| age | −0.90 | negative | ✅ |
| year | +0.92 | positive | ✅ |

The model priced on sound economics, not spurious correlations.

---

## CV detector (YOLOv8-small) — _pending training completion_

Training (`notebooks/02`, Kaggle P100, torch 2.5.1/cu121 for sm_60 support) and held-out eval
(`notebooks/03`) in progress. mAP@0.5, mAP@0.5:0.95, and per-class precision/recall will be filled
here from `eval/cv_eval_report.json` (the strictly held-out split) once the run finishes. No
placeholder numbers are recorded until then.

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

## Report faithfulness (Ragas) — _pending Phase 9_

Target: faithfulness ≥ 0.90 on the generated seller report vs. the retrieved comparables and
computed SHAP values. Filled in Phase 9.
