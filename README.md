# AutoValuate Intelligence

> Upload photos of a car, get back an instant, explainable, damage-aware fair-market valuation — backed by a trained damage-detection model, an explainable pricing model, and live comparable listings, not a guess.

Hybrid **Computer Vision + Tabular ML + Agentic-RAG** vehicle valuation SaaS, built for the UAE used-car market on a fully free-tier stack.

## Status

🚧 **Under construction** — building phase by phase per [`MASTER_PROMPT.md`](MASTER_PROMPT.md). See the roadmap in Section 14 of that file.

- [x] Phase 0 — from-zero repo & environment scaffold
- [x] Phase 1 — data acquisition & prep
- [~] Phase 2 — CV model training (Kaggle) — data unified (14,437 train imgs, 8 classes); YOLOv8 training running
- [ ] Phase 3 — CV inference service (Hugging Face Space)
- [x] Phase 4 — tabular valuation model (XGBoost + SHAP; 19.6% median error, beats baseline 28.4%, calibrated 80% interval)
- [x] Phase 5 — comparables RAG layer (hybrid dense+BM25+structured+rerank; same-make precision@5 = 1.0; pgvector-ready)
- [x] Phase 6 — orchestration API & agent graph (LangGraph 7-node graph, SSE trace, Verifier gate, confidence disclosure)
- [x] Phase 7 — frontend (premium Next.js: dark/light toggle, live SSE trace, SHAP waterfall, citation-grounded report, mobile-responsive)
- [x] Phase 8 — integration & end-to-end testing (53 checks green: 18-vehicle E2E + adversarial verifier + HTTP/SSE contract)
- [ ] Phase 9 — evaluation & guardrails
- [ ] Phase 10 — deployment, CI/CD & polish
- [ ] Phase 11 — presentation deck + script

## Live links

_Populated as each service is deployed._

| Component | Host | URL |
|---|---|---|
| Frontend | Vercel | _tbd_ |
| CV inference Space | Hugging Face | _tbd_ |

## Architecture (high level)

```
Photos + details ──▶ Orchestration API (FastAPI + LangGraph on Render)
                        │
     ┌──────────────────┼───────────────────────────┐
     ▼                  ▼                            ▼
CV damage detector   XGBoost + SHAP            Comparables RAG
(YOLOv8 on HF Space)  valuation model          (Supabase pgvector)
                        │
                        ▼
             Report Agent (Gemini → Groq) ──▶ Verifier Agent
             (every number citation-grounded)
```

Full design, datasets, and free-tier rationale live in [`MASTER_PROMPT.md`](MASTER_PROMPT.md), [`DECISIONS.md`](DECISIONS.md), and `docs/ARCHITECTURE.md`.

## Repository layout

| Path | What lives here |
|---|---|
| `frontend/` | Next.js 14 app (Vercel) |
| `backend-api/` | FastAPI orchestration + agents (Render) |
| `cv-service/` | Hugging Face Space wrapping the YOLOv8 damage detector |
| `notebooks/` | Kaggle training + EDA notebooks (offline) |
| `data/` | Raw + processed datasets (gitignored) |
| `eval/` | Fixed benchmark set + evaluation scripts |
| `docs/` | Architecture, viva Q&A, presentation deliverables |

## Data privacy

Uploaded photos are user-owned, stored in user-scoped Supabase Storage buckets, and deletable on request. No synthetic or LLM-generated training data is used anywhere — every dataset (CarDD, VehiDE, UAE Car Used Dataset) is real, public, and independently verifiable.
