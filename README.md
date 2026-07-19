<div align="center">

# AutoValuate Intelligence

### Explainable, damage-aware used-car valuation for the UAE

*Snap a few photos, add a few details, and get an instant fair-market value you can actually defend — with the reasoning shown, not hidden. A trained damage detector runs **on your device**, an explainable model prices the car, live comparables ground it, and every number in the report is checked before you see it.*

**Computer Vision · Explainable ML · Agentic RAG — on a 100% free-tier stack**

[![live](https://img.shields.io/badge/demo-live-4FD18B?style=flat-square)](https://auto-valuate-intelligence.vercel.app)
[![CV mAP](https://img.shields.io/badge/CV%20mAP%400.5-0.732-F5A623?style=flat-square)](docs/RESEARCH.md)
[![faithfulness](https://img.shields.io/badge/report%20faithfulness-1.000-F5A623?style=flat-square)](eval/faithfulness_report.json)
[![a11y](https://img.shields.io/badge/WCAG%202.1%20AA-0%20violations-4FD18B?style=flat-square)](#accessibility--responsiveness)

</div>

---

## 🔗 Live

| Surface | URL |
|---|---|
| **Web app** | **https://auto-valuate-intelligence.vercel.app** |
| **Valuation API** | https://autovaluate-api.onrender.com |
| **Public model report card** | [/model](https://auto-valuate-intelligence.vercel.app/model) — live eval metrics |

> The free-tier API sleeps after 15 min idle; a keep-alive workflow pings it, and the app shows a clear loading state on cold start. If the backend is ever unreachable it falls back to a labelled demo result, so the link is never blank.

---

## What it does

Three AI systems work together, and the final report cites every claim back to the model that produced it.

| System | What it is | How it's honest |
|---|---|---|
| **👁 Damage detection** | YOLOv8-small fine-tuned on 15,621 images (CarDD + VehiDE), 8 damage classes | Runs **in the browser** via ONNX — photos never leave your device (enforced by test, not convention). mAP@0.5 = **0.732** on a **validation subset, not a held-out test set**, covering only 6 of the 8 classes — see [`docs/CV_FINDINGS.md`](docs/CV_FINDINGS.md) |
| **📈 Explainable pricing** | XGBoost quantile regression on log-price, with **SHAP** attribution | **Split-conformal** confidence interval calibrated on held-out data (80.0% coverage) — no false precision |
| **🔍 Comparable retrieval** | Hybrid RAG: sentence embeddings + BM25 + structured similarity over real Dubizzle listings | Same-make preference; retriever proven at its data-limited ceiling (see [research](docs/RESEARCH.md)) |
| **🧾 Report + assistant** | LLM writes the report and answers questions (Gemini → Groq → deterministic fallback) | A **Verifier** rejects any number that doesn't trace to a computed value — faithfulness **1.000** |

---

## Features

Everything below is **free** — there are no paid tiers, no accounts, no sign-up. (Paid plans were
removed while the project's AGPL-3.0 licensing question is open; see [Licensing status](#licensing-status).)

**Valuation & explanation**
- Instant valuation with a **SHAP breakdown** of every price driver
- **On-device damage scan** + a guided "walk-around" capture flow — photos never leave your device
- **Repair-cost estimator** with a *worth-fixing?* verdict
- **Sell-timing forecast** — this car aged forward through the real model
- **Market analytics** — price-vs-mileage, market-position gauge, comparables (states its own limits when a model is too rare to chart)
- **Grounded chat assistant** and a citation-checked written report
- **PDF export**, **shareable public links** with social preview cards, an **appraisal certificate**
- "**Describe your car**" plain-English intake · **installable PWA** (scanner works offline)

**Dealer & developer**
- **Dealer fleet valuation** — bulk CSV in, valued CSV out (`/dealer`)
- **Open API** — no key, no account, rate-limited per IP (`/developers`)

---

## Architecture

```mermaid
flowchart LR
    subgraph Client["🖥️ Browser — Next.js 14 on Vercel"]
        UI["UI · Recharts · PWA"]
        CV["👁 On-device YOLOv8<br/>(onnxruntime-web)<br/>photos never leave device"]
    end

    subgraph API["⚙️ FastAPI on Render"]
        EP["/valuate · /estimate<br/>/chat · /valuate/stream"]
        RL["per-IP rate limit<br/>(open, no key)"]
    end

    subgraph Pipeline["🧠 LangGraph agent pipeline"]
        direction LR
        I["Intake"] --> A["Aggregate<br/>condition"]
        A --> P["Pricing<br/>XGBoost + SHAP<br/>+ conformal"]
        P --> R["Retrieval<br/>hybrid RAG"]
        R --> W["Report<br/>(LLM)"]
        W --> V["✅ Verifier<br/>gate"]
    end

    subgraph Data["🗄️ Supabase"]
        DB["pgvector<br/>public share links"]
    end

    CV -->|"client_condition"| EP
    UI --> EP
    RL --> EP
    EP --> Pipeline
    R -.->|comparables| DB
    W -.->|"Gemini → Groq → template"| LLM["LLM providers"]

    Train["🎓 Kaggle GPU<br/>training"] -.->|best.onnx| CV
    GH["🔁 GitHub Actions<br/>CI · corpus cron · keep-alive"] -.-> API
```

**Deep-learning & ML applied:** CNN object detection · transfer learning · IoU / NMS · Weighted Box Fusion · mAP · in-browser ONNX inference (WASM) · gradient-boosted trees · **split-conformal prediction** (Mondrian, per-tier) · **SHAP** · sentence embeddings · BM25 · structured-similarity retrieval · LangGraph agents · retrieval-augmented generation · deterministic verification.

---

## Screenshots

<table>
<tr>
<td width="50%"><img src="docs/presentation/shots/01_hero.png" alt="Cinematic hero" /><br/><sub><b>Cinematic hero</b> — self-drawing GT line-art, live telemetry ticker</sub></td>
<td width="50%"><img src="docs/presentation/shots/02_valuation_shap.png" alt="Valuation + SHAP" /><br/><sub><b>Explainable valuation</b> — SHAP shows every price driver in AED</sub></td>
</tr>
<tr>
<td><img src="docs/presentation/shots/03_damage_cv.png" alt="On-device damage scan" /><br/><sub><b>On-device damage scan</b> — YOLOv8 in the browser + severity radar</sub></td>
<td><img src="docs/presentation/shots/04_repair.png" alt="Repair estimate" /><br/><sub><b>Repair estimate</b> — itemised cost + a worth-fixing verdict</sub></td>
</tr>
<tr>
<td><img src="docs/presentation/shots/05_market_charts.png" alt="Market analytics" /><br/><sub><b>Market analytics</b> — price-vs-mileage, market-position gauge</sub></td>
<td><img src="docs/presentation/shots/07_report_verifier.png" alt="Grounded report" /><br/><sub><b>Grounded report</b> — every figure checked by the Verifier</sub></td>
</tr>
<tr>
<td><img src="docs/presentation/shots/09_dealer.png" alt="Dealer fleet valuation" /><br/><sub><b>Dealer fleet valuation</b> — bulk CSV in, valued CSV out</sub></td>
<td><img src="docs/presentation/shots/11_model_card.png" alt="Public model report card" /><br/><sub><b>Model report card</b> — every metric, published live at <code>/model</code></sub></td>
</tr>
</table>

---

## Results & honest evaluation

Every figure here is reproducible from a committed script + JSON — nothing is quoted from memory.

| Metric | Value | Source |
|---|---:|---|
| Pricing — median APE | **15.65%** | `eval/valuation_metrics.json` |
| Pricing — conformal coverage (target 80%) | **≈79%** | `eval/uncertainty_study.json` |
| Pricing — improvement over make+model baseline | **+46%** | `eval/valuation_metrics.json` |
| Report faithfulness | **1.000** | `eval/faithfulness_report.json` |
| Retrieval same-make P@5 (benchmark) | **1.000** | `eval/comparables_eval.json` |
| CV detection — mAP@0.5 | **0.732** *(see caveat)* | `eval/cv_train_summary.json` |
| Accessibility (axe-core, 6 pages) | **0** violations | WCAG 2.1 AA |
| Scoring parity (browser == backend) | **56/56 cases** | `eval/cv_scoring.py` |

### What we're honest about

- **The damage scan is honest, not yet reliable.** The `0.732` mAP is on a **validation subset,
  not a held-out test set**, and covers 6 of 8 classes. More importantly, the detector is
  **unstable to framing**: on a real whole-car photo, a 3% crop can swing the condition score by
  ~47 points, because it was trained on close-up damage crops, not the wide shots users upload.
  The product handles this honestly — a scan that finds nothing reads *"unconfirmed, not clean"*
  and always advises an inspection — but the underlying accuracy needs a retrain
  ([`notebooks/09_yolo_framing_invariance_retrain.ipynb`](notebooks/09_yolo_framing_invariance_retrain.ipynb)).
  The full diagnosis, with the four downstream fixes that were tried and rejected on measurement,
  is in [`docs/CV_FINDINGS.md`](docs/CV_FINDINGS.md).
- **The pricing floor is data, not tuning.** The learning curve (`eval/learning_curve.py`)
  asymptotes near ~10% median APE with the current features and 1,302 rows — so no amount of
  hyperparameter search reaches the ~8% published floor for larger corpora. The lever is data.

Two research findings — both argued *against* the obvious design choice — are written up in **[docs/RESEARCH.md](docs/RESEARCH.md)**:
- **Uncertainty (D3):** raw quantile regression promises 80% coverage but delivers **54.8%**; the "±25% rule of thumb" delivers **56.3%**. Only split-conformal keeps its promise.
- **Retrieval (D5):** we *proved* the retriever is at its mathematical ceiling — the limit is corpus size, not the algorithm, so data growth is the only lever.

---

## Run locally

```bash
# backend
cd backend-api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
USE_TF=0 uvicorn main:app --port 8000

# frontend (new terminal)
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://127.0.0.1:8000" > .env.local
npm run dev   # → http://localhost:3000
```

Optional: set `GEMINI_API_KEY` or `GROQ_API_KEY` for LLM-written reports (a deterministic writer is used otherwise); set `ENABLE_LOCAL_CV=1` to run the detector server-side instead of in the browser.

---

## Tests & evaluation

```bash
python eval/unit_tests.py            # 65 backend guardrail + contract tests
python eval/cv_scoring.py            # scoring bands + browser==backend parity (56 cases)
python eval/cv_conformance.py        # browser/backend post-processing parity
python eval/faithfulness_eval.py     # report grounding (Verifier)
python eval/spec_join_study.py       # the +2.4pp spec-join result, with a permutation control
python scripts/stability_check.py <photo>   # framing-stability of the damage scan
cd frontend && node scripts/cv-determinism-run.mjs && npm run build   # determinism + build
```

The CV gate (`.github/workflows/cv-gate.yml`) runs the scoring, conformance, determinism and
contract suites on every change that touches the detector.

---

## Accessibility & responsiveness

Verified with a real headless browser: **zero horizontal overflow** at 320 / 375 / 768 / 1440 px, and **zero WCAG 2.1 AA violations** (axe-core) across all six pages. Full dark/light theming; the damage scanner works offline as an installed PWA.

---

## Repository

```
frontend/        Next.js 14 app — UI, on-device CV (lib/cv-browser.ts), charts, PWA
backend-api/     FastAPI + LangGraph agents, XGBoost model, RAG, Verifier
cv-service/      trained YOLOv8 ONNX model (also served in-browser from frontend/public)
eval/            evaluation + research scripts and reports (the source of every number above)
docs/            ARCHITECTURE · RESEARCH · CV_INFERENCE_SPEC · CV_FINDINGS · LICENSING
notebooks/       CV training/retraining + valuation EDA notebooks
data/            processed comparables corpus
```

---

## Team

**SP Jain School of Global Management — group project**

| Member | ID | Focus |
|---|---|---|
| **Krishna Mathur** | AS25DXB018 | Deep learning — the on-device damage detector |
| **Yash Petkar** | AS25DXB020 | Valuation model, data pipeline & live product build |
| **Atharva Soundankar** | AS25DXB021 | Agentic backend, orchestration & RAG retrieval |
| **[ Fourth member ]** | AS25DXB0__ | Frontend, UX & product |

---

## Licensing status

This project is licensed under **[AGPL-3.0](LICENSE)**. The damage-detection weights derive from
Ultralytics YOLOv8 (AGPL-3.0), and this repository is public, so AGPL is the honest declaration
rather than a choice made for convenience — see [`docs/LICENSING.md`](docs/LICENSING.md).

AGPL permits charging money; it does not permit withholding source from network users. Closed-
source commercial use would still require an Ultralytics Enterprise License or a permissively
licensed replacement detector. Until that is decided, the product ships **free, with no paid
plans** — the pricing tiers and payment flow were removed rather than advertised.

---

<div align="center">

*An automated estimate — not a certified appraisal. Every figure traces back to a computed value.*

</div>
