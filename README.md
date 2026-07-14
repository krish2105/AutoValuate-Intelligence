<div align="center">

# AutoValuate Intelligence

### Explainable, damage-aware car valuation for the UAE

*Upload photos of a car and a few details — get an instant, explainable, damage-aware fair-market value, backed by a trained damage detector, an explainable pricing model, and live comparable listings. Every number is traceable.*

**Computer Vision · Explainable ML · Agentic RAG — on a 100% free-tier stack**

</div>

---

## 🔗 Live demo

| Surface | URL | Status |
|---|---|---|
| **Web app** (Vercel) | **https://auto-valuate-intelligence.vercel.app** | 🟢 live |
| **Valuation API** (Render) | `https://autovaluate-api.onrender.com` | deploying |
| **Damage detector** | in-process (onnxruntime) in the API · `ENABLE_LOCAL_CV` | mAP 0.732 |

> Runs fully locally today (see [Run locally](#-run-locally)). Deploy steps for all three free tiers are in [Deploy](#-deploy-all-free-tier). The app degrades to a demo result if the API is asleep, so the link is never blank.

---

## What it does

Three AI systems work together, and the final report cites every claim back to the model that produced it:

- **🧠 Deep learning** — a YOLOv8 damage detector fine-tuned on ~18,000 real annotated images (CarDD + VehiDE), 8 damage classes, served CPU-only.
- **📊 Explainable ML** — an XGBoost quantile price model with SHAP explanations, on real scraped Dubizzle listings, with a calibrated confidence interval.
- **🤖 Agentic RAG** — a LangGraph pipeline (intake → damage → pricing → comparables → report → **verifier** → confidence) with a hard citation-grounding gate.

## 📈 Results (reproducible — `./eval/run_all.sh`)

| Area | Metric | Value |
|---|---|---|
| Valuation | median abs. % error (5-fold, held-out) | **19.6%** |
| Valuation | vs. naive baseline | **+29.3%** better |
| Valuation | honest held-out interval coverage (split-conformal) | **0.776** |
| Comparables | same-make precision@5 | **1.00** |
| Report | faithfulness (deterministic claim-grounding) | **1.000** · neg-control 0.000 |
| Guardrails | confidence-disclosure contract | **90 checks, 0 fail** |
| Integration | full E2E + adversarial + API suites | **53 checks, all green** |
| CV detector | mAP@0.5 (held-out) | **0.732** · glass_shatter 0.98 |

Full methodology and every number: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Design decisions: [`DECISIONS.md`](DECISIONS.md).

## 🏗️ Architecture

```
Web app (Vercel) ──HTTPS · REST+SSE──▶ Orchestration API (FastAPI + LangGraph · Render)
                                          │
   Intake → Damage(CV) → Valuation → Comparables → Report → Verifier → Confidence
                              │            │              │
                    CV detector       XGBoost+SHAP   Comparables RAG
                  (YOLOv8 · HF Space) (in-process)   (pgvector / local)
                              │
                    Report Agent (Gemini → Groq → template) ─▶ Verifier (hard citation gate)
```

## 🧰 Tech stack — all free tier

| Layer | Tech | Host (free) |
|---|---|---|
| Frontend | Next.js 14 · Tailwind · framer-motion · Recharts | **Vercel** Hobby |
| Orchestration API | FastAPI · LangGraph | **Render** free web service |
| CV inference | YOLOv8 → ONNX · onnxruntime (no torch) | **Hugging Face** Space (CPU Basic) |
| Data + vectors | Postgres · pgvector | **Supabase** free |
| LLM | Gemini Flash → Groq Llama 3.3 (fallback) | free tiers |
| Training | YOLOv8 + XGBoost | **Kaggle** GPU (offline) |
| CI/CD | 3 deploy workflows + Supabase keep-alive | **GitHub Actions** |

## ▶️ Run locally

```bash
# 1) Backend (loads models once; USE_TF=0 pins the torch backend)
cd backend-api && USE_TF=0 uvicorn main:app --port 8000

# 2) Frontend (new terminal)
cd frontend
echo "NEXT_PUBLIC_API_URL=http://127.0.0.1:8000" > .env.local
npm install && npm run dev            # → http://localhost:3000

# 3) Full evaluation + integration suite
./eval/run_all.sh
```

## 🚀 Deploy (all free-tier)

Full click-by-click checklist: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). In short:

1. **Hugging Face** — new Space → SDK **Docker**, hardware **CPU basic (free)**, name `autovaluate-cv`. The `deploy-cv-space.yml` workflow mirrors `cv-service/` on each push; drop the trained `best.onnx` into `cv-service/model/`.
2. **Render** — New Web Service → connect repo → root `backend-api/` (reads `render.yaml`). Set env: `GEMINI_API_KEY`, `GROQ_API_KEY`, `CV_SERVICE_URL`, `SUPABASE_*`, `ALLOWED_ORIGINS`.
3. **Vercel** — Import repo → root `frontend/` → set `NEXT_PUBLIC_API_URL` to the Render URL.
4. **Supabase** — new project → run `backend-api/agents/load_comparables_supabase.py --create-schema` to seed pgvector. Keep-alive workflow prevents the 7-day auto-pause.

GitHub Actions secrets (each workflow skips gracefully until set): `RENDER_DEPLOY_HOOK`, `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`, `HF_TOKEN`/`HF_USERNAME`/`HF_SPACE`, `SUPABASE_URL`/`SUPABASE_ANON_KEY`.

> **Free-tier notes:** Render free spins down after 15 min idle (~1 min cold boot — the UI shows a waking state). The comparables torch stack exceeds Render's 512 MB; production uses an ONNX query-embedder + Supabase pgvector ([`DECISIONS.md`](DECISIONS.md) ADR-014).

## 👥 Team

MAIB · SP Jain School of Global Management (Dubai)

| Name | ID |
|---|---|
| Krishna Mathur | AS25DXB018 |
| Yash Petkar | AS25DXB020 |
| Atharva Soundankar | AS25DXB021 |
| _member 4 — TBC_ | — |

## 🔒 Data & honesty

Every dataset is real, public, and verifiable — CarDD, VehiDE (vision), and freshly-scraped real Dubizzle listings (tabular). **No synthetic or LLM-generated training data** ([`DECISIONS.md`](DECISIONS.md) ADR-011). This is an automated estimate, **not a certified appraisal** — the system says so and recommends a professional inspection when confidence is limited.
