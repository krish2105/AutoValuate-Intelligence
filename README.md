# AutoValuate Intelligence

> Upload photos of a car, get back an instant, explainable, damage-aware fair-market valuation — backed by a trained damage-detection model, an explainable pricing model, and live comparable listings, not a guess.

Hybrid **Computer Vision + Tabular ML + Agentic-RAG** vehicle valuation SaaS for the UAE used-car market, on a fully free-tier stack. Three AI systems work together and every number in the final report is citation-grounded to a specific model output.

## What it proves

- **Deep learning** — a YOLOv8 damage detector fine-tuned on ~18k real annotated images (CarDD + VehiDE), 8 damage classes.
- **Explainable classical ML** — an XGBoost quantile price model with SHAP, on real scraped Dubizzle listings.
- **Agentic RAG** — a LangGraph pipeline (intake → CV → pricing → comparables → report → verifier → confidence) with a hard citation-grounding gate.

## Real, honestly-reported numbers

Every figure is reproducible from the repo (`eval/run_all.sh`; source of truth: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)).

| Area | Metric | Value |
|---|---|---|
| Valuation | median abs. % error (5-fold CV, held-out) | **19.6%** |
| Valuation | improvement over naive baseline | **28.4%** |
| Valuation | calibrated 80% price interval (split-conformal) | **0.799** coverage |
| Valuation | SHAP directional checks (mileage/age/year) | **all pass** |
| Comparables | same-make precision@5 | **1.00** |
| Report | faithfulness (deterministic claim-grounding) | **1.000** (neg. control 0.000) |
| Guardrails | Section 15 confidence contract | **90 checks, 0 fail** |
| Integration | full E2E + adversarial + API suites | **53 checks, all green** |
| CV detector | mAP@0.5 / per-class P·R | _pending training run_ |

## Status

- [x] Phase 0 — from-zero repo & environment scaffold
- [x] Phase 1 — data acquisition & prep (real Dubizzle scrape; synthetic dataset rejected, see [DECISIONS.md](DECISIONS.md))
- [~] Phase 2 — CV training on Kaggle (data unified: 14,437 train imgs, 8 classes; YOLOv8 run in progress)
- [x] Phase 3 — CV inference Space (FastAPI + onnxruntime YOLOv8 + NMS, decode path verified; awaits `best.onnx`)
- [x] Phase 4 — XGBoost + SHAP valuation model
- [x] Phase 5 — comparables RAG (dense + BM25 + structured + cross-encoder rerank; pgvector-ready)
- [x] Phase 6 — LangGraph orchestration API (SSE trace, Verifier gate, confidence disclosure)
- [x] Phase 7 — premium Next.js frontend (dark/light, live trace, SHAP waterfall, citation report, mobile)
- [x] Phase 8 — integration & E2E testing
- [x] Phase 9 — evaluation & guardrails
- [x] Phase 10 — deployment, CI/CD & polish
- [x] Phase 11 — presentation deck (16 slides, real screenshots + numbers) + natural human script (~9 min)

## Live links

_Populated on deploy — see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)._

| Component | Host | URL |
|---|---|---|
| Frontend | Vercel | _tbd_ |
| CV inference Space | Hugging Face | _tbd_ |
| Orchestration API | Render | _tbd_ |

## Architecture

```
Photos + details ──▶ Orchestration API (FastAPI + LangGraph on Render)
                        │
   Intake → Aggregation(CV) → Valuation → Comparables → Report → Verifier → Confidence
                        │            │             │
                        ▼            ▼             ▼
              CV detector      XGBoost+SHAP   Comparables RAG
            (YOLOv8, HF Space)  (in-process)  (pgvector / local artifact)
                        │
                        ▼
             Report Agent (Gemini → Groq → template) ──▶ Verifier (hard citation gate)
```

Each stage streams to the UI over SSE. The Verifier rejects any report figure that doesn't trace to a computed value.

## Run it locally (no accounts needed)

```bash
# backend  (loads models once; USE_TF=0 pins the torch backend)
cd backend-api && USE_TF=0 uvicorn main:app --port 8000

# frontend (new terminal)
cd frontend && echo "NEXT_PUBLIC_API_URL=http://127.0.0.1:8000" > .env.local && npm install && npm run dev

# full evaluation + integration suite (5 suites)
./eval/run_all.sh
```

Open http://localhost:3000. If the backend is down the UI falls back to a demo result, so the link is never blank.

## Repository layout

| Path | What lives here |
|---|---|
| `frontend/` | Next.js 14 app (Vercel) |
| `backend-api/` | FastAPI orchestration + agents + models (Render) |
| `cv-service/` | Hugging Face Space wrapping the YOLOv8 detector |
| `notebooks/` | Kaggle training + EDA notebooks (offline) |
| `data/` | Data prep script; raw/processed gitignored |
| `eval/` | Fixed 18-vehicle benchmark + all evaluation/test suites |
| `docs/` | `ARCHITECTURE.md` (numbers), `DEPLOYMENT.md`, presentation |
| `.github/workflows/` | Vercel / Render / HF-Space deploy + Supabase keep-alive |

## Data & privacy

Every dataset is real, public, and independently verifiable — CarDD, VehiDE (vision), and freshly-scraped real Dubizzle UAE listings (tabular). **No synthetic or LLM-generated training data anywhere** ([DECISIONS.md](DECISIONS.md) ADR-011 documents rejecting a synthetic dataset). Uploaded photos are user-owned and deletable. This is an automated estimate, not a certified appraisal — the system says so, and recommends a professional inspection when confidence is limited.
