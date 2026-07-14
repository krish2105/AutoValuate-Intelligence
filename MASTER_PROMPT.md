# AutoValuate Intelligence — Master Prompt & End-to-End Implementation Plan

> **Codename:** `AutoValuate` (rename freely — e.g. *CarIQ*, *ValuAI*, *WhiteVirtus Valuation Engine*)
> **Type:** Hybrid Computer Vision + Tabular ML + Agentic-RAG vehicle valuation SaaS (MVP-first)
> **Author:** Krishna Mathur
> **Status:** Planning / spec only — **no application code in this document**. This is the blueprint Claude Code will execute, phase by phase, starting from a completely empty GitHub repo and an empty local folder — nothing is assumed to exist yet.
> **How to use this file (starting from zero):**
> 1. On GitHub: create a new **empty** repository (e.g. `AutoValuate-Intelligence`) — no README, no `.gitignore`, no license auto-generated, so it's truly blank.
> 2. On your laptop: create an empty local folder with the same name, `cd` into it, run `git init`, then `git remote add origin <your-repo-url>`.
> 3. Drop this file into that empty folder as `MASTER_PROMPT.md` — this is the very first file that exists in the project.
> 4. Open Claude Code **inside that folder** and paste **Part 19 (The Distilled Master Prompt)** as your first message.
> 5. Claude Code starts at Phase 0 — creating every account, every folder, every config file from nothing — then scaffolds the repo, builds phase-by-phase, commits per phase, and deploys to the free-tier hosting map in Part 12.
> 6. Review and test after every phase — don't let it run all 11 phases unattended in one sitting.

---

## Why this version is deployment-real, not a "brackets" spec

Three things usually kill a student CV/ML project the moment a recruiter tries to click the live link, and this version locks all three down before you write a line of code:

1. **Railway is no longer a real free host in 2026.** It moved to a one-time $5 trial credit — once that's consumed, your container stops until you add a card. Every other version of "free stack" advice you'll find online still says "Vercel + Railway/Render" out of habit. This blueprint uses **Render** as the only backend host, with its actual current limits accounted for (free web service: 512MB RAM / 0.1 CPU, spins down after 15 min idle, ~1 min cold boot on the next request).
2. **A real object-detection model does not fit in 512MB RAM.** So the CV inference layer is **not** hosted on Render — it's hosted on a **Hugging Face Space (free CPU Basic: 2 vCPU / 16GB RAM)**, which is the only free tier generous enough to actually run a YOLOv8/Detectron2 model. Training happens separately and for free on **Kaggle Notebooks (30 GPU-hours/week, P100/T4)**.
3. **Supabase free projects auto-pause after 7 days with no API traffic.** If a recruiter opens your live link two weeks after your last commit, they'll hit a paused, dead database. This blueprint includes a scheduled GitHub Actions "keep-alive" ping specifically to prevent that — a detail almost nobody's student project accounts for, and a great thing to mention if asked "how do you keep this reliable."

Everything else below — datasets, models, agent design — is chosen to be **real, verifiable, and zero-cost**, the same discipline you used on FinCopilot and ComplianceAgent.

---

## Table of Contents
1. One-liner & elevator pitch
2. Problem statement (the pain, with evidence)
3. Target users, personas & who pays (SaaS framing)
4. MVP scope vs. full vision
5. Core features (functional requirements)
6. System architecture (CV + tabular ML + agentic RAG)
7. Full tech stack — concrete, free, verified (no brackets)
8. Data sources & ingestion (real, public, licensed)
9. Premium UI / design system
10. Repository structure
11. Free-tier cost governance & fallback strategy
12. Deployment architecture — exact free-tier hosting map
13. GitHub workflow & CI/CD
14. Phased implementation roadmap (11 phases)
15. Evaluation, guardrails & the confidence-disclosure contract
16. SaaS layer, auth, multi-tenancy, security
17. **Presentation deliverable — premium PPT + natural human presentation script (Phase 11)**
18. Deliverables checklist, portfolio framing & Viva Q&A
19. **The distilled Master Prompt (paste into Claude Code)**

---

## 1. One-liner & Elevator Pitch

**One-liner:** Upload photos of a car, get back an instant, explainable, damage-aware fair-market valuation — backed by a trained damage-detection model, an explainable pricing model, and live comparable listings, not a guess.

**Elevator pitch:** Every used-car seller in the UAE faces the same problem: dealers quote low to protect their resale margin, classifieds show asking prices instead of real sale prices, and nobody tells you how much that door dent is actually costing you. AutoValuate fixes this with three AI systems working together: a **computer vision model** trained on 18,000+ real damage-annotated images that scans your photos and flags every dent, scratch, and panel issue; a **gradient-boosted valuation model** that prices the car using make, model, year, mileage, and spec, with SHAP-based transparency on exactly why it landed on that number; and an **agentic reporting layer** that retrieves comparable live listings and writes a plain-English seller report — "your car is worth AED X–Y, the rear-bumper scratch cost you about AED 800, here are 5 similar cars currently listed nearby." Every number in the report traces back to either the vision model, the pricing model's SHAP values, or a specific retrieved comparable — nothing is invented.

---

## 2. Problem Statement (the pain)

- Existing online valuation tools are considered only "generally more accurate" by industry commentary, and professional in-person inspection is still routinely recommended for anything precise — the market has not solved trustworthy self-serve valuation.
- The UAE used car market was valued at USD 9.59 billion in 2020 and is projected to reach roughly USD 20.63 billion by 2026 — this is a large, real, still-growing market, not a toy problem.
- Sellers are told to "arrange a dealer/third-party inspection" for a trustworthy number, which costs time and money and defeats the purpose of a quick online listing.
- Damage is priced by gut feeling on both sides of a transaction — nobody quantifies "this specific dent + this mileage + this spec = this much off the base price," which is exactly what an explainable ML model is good at.
- No existing consumer tool combines **visual damage assessment** with **explainable pricing** with **live comparable evidence** in one report — each piece exists somewhere, none of them are stitched together end-to-end.

---

## 3. Target Users, Personas & Who Pays

**Persona 1 — Individual Seller ("Ahmed, expat professional relocating"):** Wants a fast, trustworthy number before listing on Dubizzle/YallaMotor, without paying for an inspection. **Free tier user.**

**Persona 2 — Small Used-Car Dealer ("AutoLine Motors, Sharjah"):** Buys 15–20 trade-ins a month, needs fast, defensible pricing for inventory intake, and wants to justify offers to sellers with a report rather than "trust me." **Paid tier — this is who pays.**

**Persona 3 — Marketplace / Classifieds Platform (stretch, post-MVP):** Could license the valuation+damage API as a "verified estimate" badge on listings — B2B API model, highest-value but not MVP scope.

**SaaS framing:** Freemium for individuals (3 free valuations/month), a paid dealer tier for bulk/API access. This is the "who pays" story for interviews even though the MVP itself won't process real payments.

---

## 4. MVP Scope vs. Full Vision

**MVP (what you actually build):**
- Single-vehicle flow: user uploads 1–8 photos + enters make/model/year/mileage/spec/service history
- CV model detects and localizes damage per photo
- Tabular model produces a price range with SHAP explanation
- RAG layer retrieves comparable listings from the UAE Car Used Dataset
- Agent writes a synthesized, citation-grounded report
- Full reasoning-trace UI (CV → pricing → comparables → report), same transparency pattern as your other agents
- Auth + saved valuation history per user

**Full vision (explicitly out of scope for MVP, mention in Viva/future-work only):**
- Dealer bulk-upload / inventory API
- Browser extension that auto-fills a Dubizzle listing from a completed valuation
- Real-time price-trend alerts ("your car's segment dropped 4% this month")
- Multi-angle 3D damage reconstruction
- Integration with UAE vehicle history/accident-record APIs (paid, not available free)

---

## 5. Core Features (Functional Requirements)

1. **Photo upload & preview** — drag-and-drop, up to 8 images, client-side compression before upload
2. **Vehicle detail form** — make, model, year, mileage, spec (GCC/American/European/Japanese import), transmission, service history flag, number of owners
3. **Damage detection report** — annotated images with bounding boxes/masks, per-part damage type + severity (minor/moderate/severe), an aggregated "Condition Score" (0–100)
4. **Valuation engine** — price range (low/mid/high), SHAP waterfall showing which features pushed price up/down, condition-score-adjusted final estimate
5. **Comparables panel** — top-5 similar listings retrieved via hybrid search (make/model/year/mileage proximity + condition), with prices and links/citations
6. **Agentic seller report** — a natural-language write-up combining all of the above, every claim citation-grounded to a specific model output or comparable ID
7. **Reasoning trace panel** — step-by-step view of what each agent/model did (CV → aggregation → valuation → comparables → report) — your signature transparency feature across all your projects
8. **Confidence disclosure** — every report explicitly states model confidence and recommends professional inspection when confidence is low (see Section 15)
9. **Valuation history dashboard** — saved past valuations per user, exportable as PDF
10. **Auth & workspaces** — Supabase Auth, one workspace per user (dealer tier = multi-vehicle batch view)

---

## 6. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Vercel)                           │
│         Next.js 14 · Tailwind · shadcn/ui · dark automotive UI      │
└───────────────────────────────┬───────────────────────────────────┘
                                 │ HTTPS (REST + SSE for streaming trace)
┌───────────────────────────────▼───────────────────────────────────┐
│                    ORCHESTRATION API (Render)                       │
│                     FastAPI + LangGraph state machine               │
│                                                                       │
│   ┌──────────────┐   ┌──────────────┐   ┌───────────────────────┐  │
│   │ Intake Agent  │──▶│ Aggregation  │──▶│  Valuation Service     │  │
│   │ (validates    │   │ Agent (merges│   │  (XGBoost, in-process, │  │
│   │  form + photo │   │ multi-image  │   │   SHAP explainer)      │  │
│   │  payload)     │   │ CV results   │   └───────────┬───────────┘  │
│   └──────┬───────┘   │ into one     │                │              │
│          │            │ Condition    │                │              │
│          │            │ Report)      │                │              │
│          │            └──────▲───────┘                │              │
│          │                    │                        │              │
│          ▼                    │                        ▼              │
│  ┌──────────────────┐         │              ┌───────────────────┐   │
│  │  CV Inference    │─────────┘              │  Comparables RAG   │   │
│  │  call-out        │                        │  Agent (hybrid     │   │
│  │  (HTTP to HF     │                        │  search over UAE   │   │
│  │  Space)          │                        │  Car Dataset in    │   │
│  └──────────────────┘                        │  Supabase pgvector) │   │
│                                                └─────────┬─────────┘   │
│                                                          │             │
│                                                          ▼             │
│                                       ┌───────────────────────────┐   │
│                                       │  Reasoning / Report Agent  │   │
│                                       │  (Gemini Flash primary →   │   │
│                                       │   Groq Llama 3.3 fallback) │   │
│                                       └─────────────┬─────────────┘   │
│                                                      ▼                 │
│                                       ┌───────────────────────────┐   │
│                                       │  Verifier Agent (rule-     │   │
│                                       │  based: every number in   │   │
│                                       │  the report must trace to │   │
│                                       │  a real computed value)   │   │
│                                       └───────────────────────────┘   │
└───────────────────────────────┬───────────────────────────────────┘
                                 │
                 ┌───────────────┼────────────────┐
                 ▼               ▼                ▼
      ┌──────────────────┐ ┌───────────┐ ┌─────────────────────┐
      │ Hugging Face Space │ │  Supabase  │ │  Kaggle (offline,    │
      │ CV Inference        │ │  Postgres  │ │  training only)      │
      │ (YOLOv8/Detectron2,  │ │  + pgvector│ │  CarDD + VehiDE +    │
      │  free CPU Basic)     │ │  + Auth +  │ │  UAE Car Dataset      │
      │                       │ │  Storage   │ │  → exports weights   │
      └──────────────────────┘ └───────────┘ └─────────────────────┘
```

**Why this is a hybrid architecture (deliberately, this is the point of the project):** unlike your agentic-RAG projects (FinCopilot, DubaiPulse, ComplianceAgent), which are entirely text/reasoning pipelines, AutoValuate has a **real trained deep learning model in the critical path** (the CV damage detector) plus a **real classical ML model with explainability** (XGBoost + SHAP), with the agentic/RAG layer wrapping *around* both to produce the final synthesized answer. This is what proves "full deep learning + full ML" rather than "another LLM wrapper."

---

## 7. Full Tech Stack — Concrete, Free, Verified (July 2026)

| Layer | Choice | Why / free-tier reality |
|---|---|---|
| **CV model** | YOLOv8-small (Ultralytics) fine-tuned on CarDD + VehiDE | Small enough to run inference on free CPU in a few seconds/image; well-documented, easy to export to ONNX |
| **CV training compute** | Kaggle Notebooks (30 GPU-hrs/week, P100/T4) | Free, no card required, generous enough for fine-tuning a small detector over a weekend |
| **CV inference hosting** | Hugging Face Spaces — **CPU Basic (free, 2 vCPU/16GB RAM)**, Docker SDK | Render's free tier (512MB RAM/0.1 CPU) cannot run this; HF Spaces can. ZeroGPU (H200, ~3.5 min/day free quota) is a bonus fallback for burst-testing, not the primary path |
| **Tabular valuation model** | XGBoost (or LightGBM) + SHAP | Runs in-process inside the FastAPI service — no separate hosting needed, negligible RAM |
| **Orchestration / agents** | LangGraph (state machine) | Mature open framework for building agentic RAG; used identically across your FinCopilot/ComplianceAgent stack |
| **LLM (report writing)** | Google Gemini 2.5 Flash-Lite/Flash (free tier, primary) → Groq Llama 3.3 70B (free tier, automatic fallback) | Same zero-cost pattern as ComplianceAgent and FinCopilot — one swappable `llm_client` interface |
| **Retrieval framework** | LlamaIndex (retrieval) + hybrid search (dense + BM25) + a lightweight cross-encoder reranker (local `sentence-transformers`, 100% free) | This is the 2026 production-grade pattern: retrieval quality is the dominant factor in whether a RAG system actually works |
| **Vector store** | Supabase pgvector (free tier Postgres) | One database serves both relational data (users, valuations, history) and vector search — no separate vector DB needed |
| **Backend API** | FastAPI on **Render** (free web service) | Only free host with full backend service support (background-safe, persistent, SSE-capable); accept the 512MB/0.1CPU limit and 15-min spin-down — the CV model is *not* here, which is exactly why this works |
| **Frontend** | Next.js 14 + Tailwind + shadcn/ui on **Vercel** (Hobby, free) | Best-in-class free Next.js hosting; 5-minute serverless function execution ceiling is fine since heavy compute lives elsewhere |
| **Auth** | Supabase Auth (free tier) | Email/password + optional Google OAuth, workspace-scoped rows via RLS |
| **File storage** | Supabase Storage (free tier, bundled) | Uploaded car photos, generated PDF reports |
| **CI/CD** | GitHub Actions (free for public repos) | Auto-deploy to Vercel + Render + HF Space on push; also runs the Supabase keep-alive ping (Section 11) |
| **Evaluation** | Ragas (retrieval/report faithfulness) + a custom CV mAP/precision-recall script + a fixed benchmark set of 15–20 real vehicle cases | Matches the eval discipline you used on FinCopilot (FinQA/TAT-QA style — a fixed, real benchmark, not self-graded homework) |

**~~Railway~~ is deliberately absent from this stack** — its 2026 free tier is a one-time $5 trial credit, not a real "always free" option, so it is not part of this architecture.

---

## 8. Data Sources & Ingestion (Real, Public, No Synthetic Data)

**Computer vision training data:**
- **CarDD** — the first public large-scale dataset for vision-based car damage detection: 4,000 high-resolution images with 9,000+ annotated instances across six damage categories (dent, scratch, crack, glass shatter, lamp broken, tire flat). Source: `cardd-ustc.github.io` / arXiv.
- **VehiDE** — 13,945 high-resolution damaged-vehicle images with 32,000+ annotated instances across eight damage categories, available on Kaggle. Use this to extend category coverage and image diversity beyond CarDD alone.
- Combined: ~18,000 real, professionally-annotated images — genuinely enough to fine-tune a small detector to a portfolio-credible mAP, not a toy demo.

**Tabular valuation + comparables data:**
- **UAE Car Used Dataset** (Kaggle, `owaiskhan9654/uae-car-used-dataset`) — a real, scraped UAE listings dataset (make, model, year, mileage, price, spec fields). This is your primary source for both training the XGBoost valuation model and populating the comparables index. The same author also published an open scraping notebook (`uae-car-used-dataset-scrapping`), which you can rerun to refresh the dataset with current listings if you want the comparables layer to feel "live" rather than static — same "reasonably current, not synthetic" discipline you applied to DubaiPulse's 2020–2026 real-estate dataset.
- Fallback/supplement: Dubizzle-derived Kaggle notebooks exist as secondary references if you need to validate feature engineering against a second source.

**Explicit non-synthetic commitment:** every dataset above is real and independently verifiable — no LLM-generated or fabricated training data anywhere in this project, matching the standard you set on FinCopilot v2.

---

## 9. Premium UI / Design System

**Aesthetic direction:** dark, automotive-dashboard feel — think a premium car-inspection app, not a generic SaaS admin panel. Deep charcoal background, a single accent color (amber or electric blue) for damage/severity indicators, monospace numerals for prices and mileage (reinforces "precision instrument" feeling).

**Screen list:**
1. **Upload & Details** — drag-and-drop photo zone + vehicle detail form, single scrolling flow
2. **Live Reasoning Trace** — SSE-streamed panel showing each agent step firing in real time (CV detecting → aggregating → pricing → retrieving comparables → writing report) — this is your signature move across all three prior projects, keep it consistent
3. **Damage Report View** — uploaded photos with bounding-box/mask overlays, a per-part condition table, aggregated Condition Score gauge
4. **Valuation Dashboard** — price range headline number, SHAP waterfall chart (which factors pushed price up/down), a comparables table with mini map or list view
5. **Full Seller Report** — the synthesized natural-language report with inline citations (clicking a citation highlights the source: a specific comparable, or a specific SHAP feature)
6. **History / Workspace** — past valuations, PDF export, (dealer tier) bulk view

**Stack specifics:** Next.js 14 App Router, Tailwind for utility styling, shadcn/ui for accessible base components (cards, tabs, dialogs), Recharts for the SHAP waterfall and price-range visualizations, a lightweight canvas/SVG overlay component for bounding-box rendering on uploaded images.

---

## 10. Repository Structure

```
AutoValuate-Intelligence/
├── MASTER_PROMPT.md                 # this file
├── README.md                        # portfolio-facing overview + live links
├── DECISIONS.md                     # architecture decision log (why each stack choice)
├── .github/
│   └── workflows/
│       ├── deploy-frontend.yml      # Vercel auto-deploy
│       ├── deploy-backend.yml       # Render auto-deploy
│       ├── deploy-cv-space.yml      # HF Space auto-deploy (push to HF git remote)
│       └── supabase-keepalive.yml   # scheduled ping to prevent 7-day auto-pause
├── frontend/                        # Next.js app (Vercel)
│   ├── app/
│   │   ├── upload/
│   │   ├── trace/
│   │   ├── report/[valuationId]/
│   │   └── dashboard/
│   ├── components/
│   └── lib/
├── backend-api/                     # FastAPI orchestration (Render)
│   ├── main.py                      # entrypoint
│   ├── agents/
│   │   ├── intake_agent.py
│   │   ├── aggregation_agent.py
│   │   ├── comparables_rag_agent.py
│   │   ├── report_agent.py
│   │   └── verifier_agent.py
│   ├── models/
│   │   └── valuation_model.py       # XGBoost load + SHAP explainer wrapper
│   ├── llm_client/
│   │   └── client.py                # Gemini primary / Groq fallback, swappable interface
│   ├── graph/
│   │   └── orchestrator.py          # LangGraph state machine definition
│   └── requirements.txt
├── cv-service/                      # Hugging Face Space (separate git remote)
│   ├── app.py                       # FastAPI/Gradio wrapper around the YOLOv8 model
│   ├── model/
│   │   └── best.onnx                # exported trained weights
│   ├── Dockerfile
│   └── requirements.txt
├── notebooks/                       # training + EDA, run on Kaggle
│   ├── 01_cv_data_prep.ipynb
│   ├── 02_yolov8_finetune_cardd_vehide.ipynb
│   ├── 03_cv_eval_mAP.ipynb
│   ├── 04_valuation_eda.ipynb
│   ├── 05_xgboost_valuation_train.ipynb
│   └── 06_shap_explainability.ipynb
├── data/
│   ├── raw/                         # gitignored — CarDD, VehiDE, UAE Car Dataset downloads
│   └── processed/
├── eval/
│   ├── benchmark_cases.json         # 15-20 fixed real test vehicles
│   ├── ragas_eval.py
│   └── cv_map_eval.py
└── docs/
    ├── ARCHITECTURE.md
    └── VIVA_QA.md
```

---

## 11. Free-Tier Cost Governance & Fallback Strategy

- **LLM calls:** Gemini Flash-Lite/Flash first (free tier, roughly 15 RPM / 1,000 RPD-class limits), automatic fallback to Groq Llama 3.3 70B (free tier, roughly 30 RPM / 1,000 RPD-class limits) on rate-limit or error — identical pattern to ComplianceAgent, implemented behind one `llm_client` interface so swapping providers later is a one-line change.
- **CV inference quota:** Hugging Face Spaces free CPU Basic has no hard request cap but shared compute — expect a few seconds per image on CPU; batch multi-image uploads sequentially with a progress indicator rather than parallel calls, to stay well within fair-use.
- **Render cold starts:** the free web service spins down after 15 minutes idle and takes about a minute to wake on the next request — surface this honestly in the UI ("waking up the analysis engine…" loading state) rather than letting a demo appear broken.
- **Supabase auto-pause:** free projects pause after 7 days with zero API traffic. Mitigate with a scheduled GitHub Actions job (in `.github/workflows/supabase-keepalive.yml`) that pings a lightweight Supabase endpoint every 3–4 days — cheap insurance so your portfolio link never appears dead to a recruiter.
- **Vercel serverless limits:** Hobby tier caps function execution at 5 minutes — irrelevant here since the frontend only proxies to the backend API and never runs heavy compute itself.
- **Training cost:** all CV/tabular training happens on Kaggle's free weekly GPU allowance, offline, with only the final exported weights (ONNX/joblib files) committed to the repo — zero recurring training cost.

---

## 12. Deployment Architecture — Exact Free-Tier Hosting Map

| Component | Host | Tier | Live artifact |
|---|---|---|---|
| Frontend (Next.js) | Vercel | Hobby (free) | `autovaluate.vercel.app` |
| Orchestration API (FastAPI + LangGraph) | Render | Free web service | `autovaluate-api.onrender.com` |
| CV inference (YOLOv8 damage detector) | Hugging Face Spaces | CPU Basic (free) | `huggingface.co/spaces/<you>/autovaluate-cv` |
| Database + pgvector + Auth + Storage | Supabase | Free tier | project URL, kept alive via scheduled ping |
| Model training | Kaggle Notebooks | Free GPU (P100/T4) | offline, weights exported to repo |
| CI/CD | GitHub Actions | Free (public repo) | triggers the three deploys above + keep-alive |

**Result:** two live, clickable URLs (frontend + a directly-testable CV Space) plus a working end-to-end product — the same "this person already does the job" signal your other projects were built to give, now extended to a domain with a real trained vision model in it.

---

## 13. GitHub Workflow & CI/CD

- `git remote add origin <your-repo-url>` — commit after every phase below, not just at the end; your commit history is part of the portfolio story, same discipline as FinCopilot.
- The `cv-service/` folder pushes to a **second git remote** (the Hugging Face Space's own git repo) via a GitHub Actions job — HF Spaces deploy on git push, so `deploy-cv-space.yml` mirrors `cv-service/` into the Space remote on every merge to `main`.
- `.env` (Gemini/Groq/Supabase keys) stays gitignored, never committed, injected via each platform's environment-variable settings (Vercel/Render/HF Space secrets, GitHub Actions secrets for CI).
- After each phase: commit, push, write a one-paragraph "what was built / what to test" note in the PR or commit message — this becomes your build-story documentation for interviews.

---

## 14. Phased Implementation Roadmap

**Phase 0 — From-zero repo & environment setup**
Assume literally nothing exists yet — no folder, no repo contents beyond `MASTER_PROMPT.md`, no accounts configured locally. In order:
1. Confirm the local folder is git-initialized and connected to the empty GitHub remote (done manually per the "How to use this file" steps above, before Claude Code opens).
2. Scaffold the full monorepo structure from Section 10 as empty folders + placeholder `README.md`/`.gitignore`/`requirements.txt` files (no application logic yet) — first commit is "chore: scaffold repository structure."
3. Walk through and confirm/create each external account needed, one at a time, checking each is actually usable before moving to the next: Kaggle account + API token (for Phase 2 training), Hugging Face account + a new empty Space (Docker SDK, CPU Basic) for the CV service, Supabase account + a new empty project (note the project URL and anon/service keys), Render account (no service created yet — that happens in Phase 6), Vercel account (no project linked yet — that happens in Phase 7), Google AI Studio account for a Gemini API key, Groq Console account for a Groq API key.
4. Create `.env.example` (committed) listing every required environment variable name with no real values, and a local `.env` (gitignored immediately, before any key is pasted into it) for actual keys during development.
5. Create the GitHub repo secrets (Settings → Secrets → Actions) for the keys CI will need later: `GEMINI_API_KEY`, `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `RENDER_DEPLOY_HOOK`, `VERCEL_TOKEN`, `HF_TOKEN` — even though the workflows that use them aren't written until Phase 10, creating the secrets now means no step later gets blocked waiting on this.
6. Commit and push the empty scaffold + `.env.example` to the GitHub remote — confirm `git push origin main` succeeds and the repo is visible on GitHub before starting Phase 1. This is the checkpoint that proves the empty-repo-to-connected-repo step actually worked.

**Phase 0 exit check:** repo scaffold is pushed and visible on GitHub, every account above is created and its credential is saved in local `.env` (not yet used by any code), and Claude Code has confirmed each with you before moving to Phase 1.

**Phase 1 — Data acquisition & prep**
Download CarDD + VehiDE, unify annotation formats (COCO-style bounding boxes/masks) into one combined dataset with a consistent damage-category schema. Download the UAE Car Used Dataset, clean and feature-engineer (age, mileage bands, spec encoding). Document all licensing in `DECISIONS.md`.

**Phase 2 — CV model training (Kaggle)**
Fine-tune YOLOv8-small on the combined CarDD+VehiDE set. Track precision/recall/mAP per damage category. Export best checkpoint to ONNX. This is the deep-learning core of the project — don't rush it; a real, honestly-reported mAP (even if modest) is more valuable than an inflated claim.

**Phase 3 — CV inference service (Hugging Face Space)**
Wrap the exported ONNX model in a small FastAPI/Gradio app, containerize it, deploy to a free CPU Basic Space. Test directly via the Space's own URL before wiring it into the backend.

**Phase 4 — Tabular valuation model (Kaggle → backend)**
Train XGBoost/LightGBM on the UAE Car Used Dataset, validate with cross-validation, wrap with a SHAP explainer. Export the trained model (joblib) into `backend-api/models/`.

**Phase 5 — Comparables RAG layer**
Load the UAE Car Used Dataset into Supabase pgvector, build the hybrid (dense + BM25) retrieval query with a cross-encoder reranker for "find similar cars to this one." Validate retrieval quality against a handful of hand-picked test vehicles before moving on.

**Phase 6 — Orchestration API & agent graph**
Build the FastAPI backend: intake validation, the LangGraph state machine wiring Intake → Aggregation (calls the HF Space) → Valuation → Comparables RAG → Report Agent (Gemini/Groq) → Verifier. Implement the `llm_client` fallback interface.

**Phase 7 — Frontend**
Build the six screens from Section 9: upload, live reasoning trace (SSE), damage report with bounding-box overlays, valuation dashboard with SHAP waterfall, full report with citations, history/workspace.

**Phase 8 — Integration & end-to-end testing**
Wire frontend → backend → HF Space → Supabase together. Run your fixed 15–20 benchmark vehicles end-to-end, checking each stage of the reasoning trace for correctness.

**Phase 9 — Evaluation & guardrails**
Run Ragas on the report-generation stage (faithfulness/relevancy targets), compute CV mAP/precision-recall on a held-out test split, implement the confidence-disclosure contract (Section 15). Document all results honestly in `docs/ARCHITECTURE.md`.

**Phase 10 — Deployment, CI/CD & portfolio polish**
Wire up all three GitHub Actions workflows (frontend/backend/CV-space deploy + Supabase keep-alive), verify both live URLs work from a cold start, write the portfolio-facing `README.md`, record a short demo walkthrough if useful for your LinkedIn/portfolio site.

**Phase 11 — Premium presentation deck + natural human presentation script (audit + internship submission)**
Generate a complete, submission-ready `.pptx` deck and a fully written, natural-sounding presentation script (see Section 17 for the exact slide-by-slide spec). This is a first-class deliverable, not an afterthought — the professor will audit the working project and then forward it for an internship, so the deck must (a) prove the project actually works with real screenshots and real numbers, and (b) be presentable out loud by a human without sounding like it was read off an AI. Do this phase **last**, after evaluation numbers exist, so every figure in the deck is real and matches the live system. Deliver both files into `docs/presentation/`.

---

## 15. Evaluation, Guardrails & the Confidence-Disclosure Contract

- **CV evaluation:** report mAP@0.5, per-category precision/recall on a held-out test split of CarDD+VehiDE — real numbers, not vibes.
- **Valuation evaluation:** cross-validated MAE/RMSE against the UAE Car Used Dataset's actual listed prices, plus SHAP consistency checks (do feature contributions make directional sense — does higher mileage always push price down?).
- **Report faithfulness:** Ragas-style faithfulness scoring on the generated seller report against the actual retrieved comparables and computed SHAP values — target faithfulness ≥0.9, matching the production discipline used across your other agentic projects.
- **Confidence-disclosure contract (non-negotiable):** every report must explicitly state (a) the CV model's detection confidence per flagged damage area, (b) the valuation model's prediction interval width, and (c) a plain-English disclaimer recommending professional inspection whenever confidence falls below a defined threshold. This is both an honest ML practice and a legally sensible one — you are not claiming to replace a certified inspector, and saying so explicitly is a strength in a Viva, not a weakness.
- **Citation grounding:** exactly as in your other projects — the Verifier Agent rejects/flags any sentence in the generated report that doesn't trace to a specific model output or comparable ID, following the same practice shown to eliminate the majority of synthesis hallucinations in production agentic RAG systems.

---

## 16. SaaS Layer, Auth, Multi-Tenancy & Security

- **Auth:** Supabase Auth, email/password + optional Google OAuth.
- **Multi-tenancy:** row-level security (RLS) on Supabase Postgres scoping every valuation record to its owning user/workspace; dealer-tier workspaces get a `workspace_id` shared across multiple team members.
- **Secrets:** all API keys (Gemini, Groq, Supabase service role) live in platform environment variables, never in code or `.env` committed to git.
- **Rate limiting:** basic per-user request throttling at the FastAPI layer to protect the free LLM/CV quotas from abuse.
- **Data privacy:** uploaded photos are user-owned, stored in Supabase Storage under user-scoped buckets, deletable on request — mention this explicitly in your README, it's a real product concern and shows product maturity.

---

## 17. Presentation Deliverable — Premium PPT + Natural Human Presentation Script

This section is the exact specification Claude Code follows in **Phase 11**. It exists because the deck is not decoration — it is what the professor audits, and then forwards for the internship. So it has two hard jobs: **prove the project genuinely works** (real screenshots, real numbers, live links), and **be deliverable out loud by a human** without sounding AI-generated.

### 17.1 Output files (both go in `docs/presentation/`)
1. `AutoValuate_Intelligence_Deck.pptx` — the premium slide deck (built with the `pptx` skill for a real, editable PowerPoint file, not an image export).
2. `AutoValuate_Presentation_Script.md` — the full spoken script, one section per slide, written to be read aloud naturally.

### 17.2 Design system for the deck (match the product)
- **Dark automotive theme** consistent with the app UI: deep charcoal background, one accent color (amber or electric blue), clean sans-serif headings, monospace for all numbers (prices, mAP, MAE) so metrics read like instrument readouts.
- **One idea per slide.** No wall-of-text slides. Bullet points are short prompts for what the speaker will expand on — the *detail* lives in the script, not on the slide.
- **Real evidence on every claim slide:** actual screenshots of the running app (upload screen, live reasoning trace, damage overlay, SHAP waterfall, final report), the real architecture diagram, and the real evaluation numbers from `docs/ARCHITECTURE.md`. No mockups, no placeholder "lorem ipsum," no invented metrics — the whole point is that an auditing professor can match every slide to the working system.
- **Speaker notes populated on every slide** with the corresponding script section, so the deck is self-contained if presented from PowerPoint's presenter view.

### 17.3 Slide-by-slide spec (16 slides)
1. **Title** — project name, one-line tagline ("Explainable, damage-aware car valuation for the UAE"), your name, program (MAIB, SP Jain), the two live URLs as clickable links.
2. **The problem** — the seller's pain, grounded in the real market facts from Section 2 (dealers quote low, classifieds show asking-not-sale prices, damage priced by gut feeling, UAE used-car market ~USD 20.6B by 2026). One striking stat, not five.
3. **Why existing tools fall short** — current valuation tools still recommend a paid inspection for a trustworthy number; nobody combines visual damage + explainable price + live comparables in one report.
4. **The solution in one picture** — a single clean diagram: photos + details in → damage detection + explainable price + comparables → plain-English report out.
5. **Live demo pointer** — a slide that says "let's see it work" with the live URL and a QR code; the script cues the presenter to switch to the actual running app here (auditors love a live demo more than any slide).
6. **System architecture** — the real architecture diagram from Section 6 (frontend/Vercel → API/Render → CV Space/HF → Supabase), with the hybrid nature called out: a trained CV model *and* a classical ML model *and* an agentic RAG layer.
7. **Deep learning: the damage detector** — what CarDD + VehiDE are (~18,000 real annotated images), YOLOv8 choice and why detection (not just classification), with a real annotated-output screenshot.
8. **CV results** — the actual mAP@0.5 and per-category precision/recall, presented honestly. A modest-but-real number, clearly explained, beats an inflated claim under audit.
9. **Classical ML: the valuation model** — XGBoost on the real UAE Car Used Dataset, cross-validated MAE/RMSE, and the SHAP waterfall screenshot showing *why* a price was reached (the explainability story).
10. **The agentic layer** — LangGraph orchestration, the reasoning-trace panel screenshot, and the Verifier Agent / citation-grounding guardrail that stops the report inventing numbers.
11. **Responsible AI** — the confidence-disclosure contract: the system states its confidence and recommends professional inspection when unsure; it does not pretend to replace a certified inspector. (This slide directly serves your AI-ethics/governance interest and reads very well to an auditor.)
12. **The tech stack & why it's all free** — the hosting map from Section 12, with the honest engineering decisions: Render not Railway, HF Spaces for the CV model, Supabase keep-alive so the link never dies. This slide proves engineering judgment, not just tutorial-following.
13. **Evaluation summary** — one consolidated slide: CV mAP, valuation MAE, report faithfulness (Ragas ≥0.9 target), all real, all traceable to the repo.
14. **Limitations & honest scope** — what the MVP does not do (no live accident-history API, CPU-speed inference, dataset coverage bounds). Naming limitations is a maturity signal auditors reward.
15. **Roadmap / future work** — dealer bulk API, Dubizzle auto-fill browser extension, price-trend alerts (the full-vision items from Section 4, clearly marked as future).
16. **Close** — recap the three proven capabilities (deep learning, explainable ML, agentic RAG), the two live links again, GitHub repo, and a simple "thank you / questions" line.

### 17.4 The presentation script — natural human voice (this is the part that must not sound AI)
Write `AutoValuate_Presentation_Script.md` so it reads like **Krishna actually talking**, not like narration. Hard rules for the script:
- **First person, conversational, contractions.** "So the problem I kept running into…" not "The problem that is addressed is…".
- **Vary sentence length.** Mix short punchy lines with longer explanatory ones — that rhythm is what makes speech sound human.
- **Include natural presenter cues in italics**, e.g. *(click to next slide)*, *(switch to the live app here)*, *(pause — let them read the number)*.
- **Open with a hook, not a definition.** A one-sentence relatable story (a friend selling a car and getting lowballed, tied to your real @thewhite_virtus car-content background) lands far better than "Today I will present…".
- **Explain every technical term the first time in one plain sentence**, because the audience mixes a technical professor with possibly non-technical internship reviewers. E.g. "SHAP — basically, it shows which factors pushed the price up or down."
- **Anticipate the audit.** Build in lines where the presenter invites scrutiny: "and you can see this running live right now at this link" / "these are the actual numbers from the evaluation, not estimates."
- **Timing target: 8–10 minutes spoken.** Add an approximate per-slide time budget in the script.
- **End with a genuine, non-robotic close** — a real sentence about what you learned building it, then thanks and questions.
- **No em-dashes-as-crutch, no "delve," no "in today's fast-paced world," no "leverage" as a verb, no listing three adjectives in a row.** These are the tells that make a script sound machine-written; the script must avoid them and sound like a confident student who built the thing and knows it cold.

### 17.5 Acceptance check for Phase 11
The deck and script are done only when: every metric on a slide matches `docs/ARCHITECTURE.md`, every screenshot is from the actually-running app, both live URLs open, and the script can be read aloud start-to-finish in under 10 minutes sounding like a person. If any number is a placeholder, the phase is not complete.

---

## 18. Deliverables Checklist, Portfolio Framing & Viva Q&A

**Deliverables checklist:**
- [ ] Two live URLs: frontend (Vercel) + CV Space (Hugging Face), both cold-start tested
- [ ] GitHub repo with phase-by-phase commit history
- [ ] `docs/ARCHITECTURE.md` with real, honestly-reported evaluation numbers (mAP, MAE, faithfulness scores)
- [ ] `DECISIONS.md` explaining every stack choice (this doc doubles as interview prep)
- [ ] A working reasoning-trace demo you can screen-share live in an interview
- [ ] `docs/presentation/AutoValuate_Intelligence_Deck.pptx` — premium deck with real screenshots and real numbers
- [ ] `docs/presentation/AutoValuate_Presentation_Script.md` — natural, human-voice script, 8–10 min, matching the deck

**Portfolio framing:** this is the project that proves you can do real deep learning (a trained, evaluated CV model — not an LLM call), real classical ML with explainability (XGBoost + SHAP), and agentic orchestration/RAG all in one coherent product — plus it connects to your own car-content background, which makes it the most memorable project in your set when you're telling your story out loud.

**Viva Q&A (sample):**
- *"Why YOLOv8 over a classification-only model?"* — Damage location matters for pricing (a windshield crack costs differently than a bumper scratch), so detection/segmentation, not just classification, was necessary.
- *"How do you know your valuation model isn't just memorizing the training set?"* — Cross-validated MAE reported on a held-out split, not training-set accuracy; SHAP directional checks catch nonsensical learned relationships.
- *"What happens if the CV model is wrong?"* — Confidence disclosure surfaces detection confidence per damage area, and low-confidence cases explicitly recommend professional inspection rather than presenting a false-certain number.
- *"Why not just use an LLM to look at the photo and describe the damage?"* — Vision-language models can hallucinate damage that isn't there or miss subtle damage; a purpose-trained detector with a real, measured mAP is more defensible and auditable than an LLM's free-text description.
- *"Why is Railway not in your stack?"* — Because as of 2026 it no longer offers a genuine free tier (one-time trial credit only), and building on a host that will silently stop working isn't production-honest.

---

## 19. The Distilled Master Prompt (paste into Claude Code)

```
You are building AutoValuate Intelligence — a hybrid computer-vision + tabular-ML + agentic-RAG
vehicle valuation SaaS. Full specification lives in MASTER_PROMPT.md in this repo — read it fully
before writing any code.

Starting state: this repo is completely empty except for MASTER_PROMPT.md, and no accounts,
services, or config exist yet anywhere. Treat Phase 0 as literal — create every folder, every
account, every secret from zero, in the exact order listed, and confirm each step actually worked
(e.g. a real push to the real GitHub remote) before moving to the next. Do not assume any tool,
account, or file exists unless Phase 0 explicitly created it.

Non-negotiables:
- No placeholder stubs, no "TODO: implement later" — build each phase completely before moving on.
- Follow the exact repository structure in Section 10.
- Use only the free-tier stack in Section 7: Vercel (frontend), Render (orchestration API),
  Hugging Face Spaces CPU Basic (CV inference), Supabase (Postgres/pgvector/Auth/Storage),
  Kaggle Notebooks (training only, offline), Gemini Flash primary / Groq Llama 3.3 70B fallback
  for the LLM report-writing agent. Do NOT use Railway — it has no real free tier in 2026.
- Use only real, public datasets: CarDD, VehiDE (computer vision), and the UAE Car Used Dataset
  (Kaggle, owaiskhan9654/uae-car-used-dataset) for tabular valuation and comparables. No synthetic
  or LLM-generated training data anywhere.
- Every claim in the final generated report must be citation-grounded to a specific model output
  (a SHAP value, a CV detection, or a specific comparable listing ID) — implement the Verifier
  Agent from Section 6 as a hard gate, not a suggestion.
- Implement the confidence-disclosure contract from Section 15 exactly as specified — this is a
  safety/honesty requirement, not optional polish.
- Account for free-tier realities explicitly: Render cold starts need a UI loading state, Supabase
  needs the scheduled keep-alive workflow, Hugging Face Spaces is the only place the CV model runs.
- Keep all secrets in platform environment variables; never hardcode or commit API keys.
- After each phase: summarize what was built, what to test, commit with a descriptive message, and
  push before continuing to the next phase.

Follow the 11-phase roadmap in Section 14 exactly, in order. Start with Phase 0.

FINAL PHASE (Phase 11) is mandatory, not optional. After the project is built, deployed, and
evaluated, produce the presentation deliverable exactly as specified in Section 17:
- Build docs/presentation/AutoValuate_Intelligence_Deck.pptx as a real, editable PowerPoint using
  the pptx skill — 16 slides, dark automotive theme matching the app, ONE idea per slide, real
  screenshots of the running app, the real architecture diagram, and the REAL evaluation numbers
  from docs/ARCHITECTURE.md. No mockups, no placeholder metrics — a professor will audit the working
  project against this deck and then forward it for an internship, so every slide must match reality.
- Populate speaker notes on every slide.
- Write docs/presentation/AutoValuate_Presentation_Script.md as a natural, first-person, human-sounding
  spoken script (8–10 minutes), one section per slide, with presenter cues, a relatable opening hook
  tied to a real car-selling story, every technical term explained plainly on first use, and explicit
  invitations for the auditor to inspect the live system. The script must NOT sound AI-generated: use
  contractions, vary sentence length, and avoid "delve," "leverage" as a verb, "in today's fast-paced
  world," em-dash crutches, and three-adjective lists.
- Phase 11 is complete only when every metric in the deck matches docs/ARCHITECTURE.md, every
  screenshot is from the actually-running app, both live URLs open, and the script reads aloud in
  under 10 minutes sounding like a real person.
```

---

### Final note

This version is designed to end with **two live URLs, a GitHub commit history that tells a real build story, honestly-reported evaluation numbers on a real trained vision model, an explainable pricing model, a premium dashboard UI, and a submission-ready presentation package (deck + natural human script)** — while correctly accounting for what actually still works for free in July 2026 (Render, not Railway; Hugging Face Spaces for the CV model, not Render; a scheduled Supabase keep-alive so the link never appears dead). Estimated build time is roughly 8–10 weeks at a similar pace to your other projects — the CV training phase (Phase 2) is the one place worth giving yourself real breathing room, since a rushed detector undermines the entire "full deep learning" claim this project exists to prove. Phase 11 (the deck + script) is deliberately last so that every figure presented to your professor is real and matches the live system exactly — which is precisely what survives an audit and earns the internship referral.
