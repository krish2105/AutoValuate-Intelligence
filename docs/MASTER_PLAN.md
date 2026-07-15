# AutoValuate Intelligence — Master Implementation & R&D Plan

> A dual-track roadmap: a **research spine** (model quality — CV, ML, RAG, on-device LLM)
> and a **product spine** (frontend, backend, MLOps, scale), sequenced so each reinforces
> the other. **100% free-tier.** Compute assumes **Kaggle (30h/wk GPU)** + Hugging Face
> free hosting. Every workstream ends in a *measured* acceptance metric — nothing ships on
> vibes.
>
> **Status:** execution began 2026-07-15 — see the ledger in §0.5 below for what is
> done, what is retired by evidence, and what is blocked on which decision or account.
> Companion docs: [`ROADMAP.md`](ROADMAP.md) · [`RESEARCH.md`](RESEARCH.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## 0. Guiding principles

1. **Free at scale.** Prefer on-device inference (CV, and now the chatbot) so marginal cost stays ~zero.
2. **Honest by construction.** Every model gets a held-out metric and a model card; the Verifier gate is never bypassed.
3. **Data > cleverness.** Two experiments already proved the biggest levers are *data*, not architecture — so the data pipeline is workstream zero, not an afterthought.
4. **Reproducible.** Config-driven runs, pinned seeds, tracked experiments, versioned data + models.
5. **Measured gates.** A change ships only if the eval it targets improves and nothing else regresses.

---

## 0.5 Status ledger (updated 2026-07-15)

Everything free-tier and locally executable was executed; each remaining item names its
exact blocker. Commits are on `feat/hero-scan-loop`.

**✅ Executed (measured, committed):**

| Item | What shipped | Evidence |
|---|---|---|
| 0.3 (partial) | Corpus is now **versioned in git** — found & fixed: `data/processed/` was gitignored, so the Phase-E cron could never persist growth; corpus reconstructed losslessly from the committed index | retrieval eval byte-identical to committed report |
| 0.5 | `scripts/validate_corpus.py` gate wired into the scrape workflow | a bad scrape can no longer merge |
| 0.7 (partial) | Scraper retains `photo_urls` per listing — unblocks A1/B2/D1 as rows accrue | keyless no-op verified |
| B4 | Monotonic-constraints study: unconstrained model raises price on 100% of km sweeps (max +22.9%); **xgboost `reg:quantileerror` ignores `monotone_constraints`** (proven single-coordinate); constrained squared-error mid = MAPE 34.2%→30.5% with 0 km violations | `RESEARCH.md` B4, `eval/model_improvement_study.py` |
| B5 | Mondrian conformal study: shipped 80% interval covers only **43.6% of luxury cars**; per-tier calibration → 59% (corpus-bound) | `RESEARCH.md` B5 |
| D1 (code) | `scripts/generate_chat_dataset.py` — real pipeline → teacher LLM → Verifier filter; smoke-tested keyless | needs LLM keys to run at scale |
| D3 (code) | `notebooks/07_chatbot_lora_finetune.ipynb` — ready-to-run LoRA scaffold with grounding/refusal gates asserted | needs Kaggle GPU + §13.1 decision |
| E2 | `/estimate/batch` (fleet in one request) + dealer page wired with per-row fallback | live uvicorn + Playwright route-mock tests |
| E3 (partial) | `model_version` (artifact content hash) stamped on every valuation's `model_meta` — rollbacks/retrains attributable | live `/v1/estimate` returns it |
| E4 (partial) | Structured JSON access log (method/path/status/ms) per request — Render log stream gives latency/error visibility, account-free | live uvicorn |
| E6 | Versioned `/v1/*` aliases (same handlers/schemas/limits) + OpenAPI description + `docs/API.md` reference | 7 `/v1` paths live; rate-limit + 429 verified on `/v1/estimate` |
| E7 | gitleaks secret scan + Dependabot (npm/pip/actions) | `.github/` |
| E8 | `/ready` readiness probe + per-provider LLM circuit breaker (3 fails → 120s cooldown) | live uvicorn verification |
| F1 (partial) | WCAG-AA contrast gate over the semantic tokens, both themes, in CI | Playwright `contrast.spec.ts`, both themes pass |
| Hero cinematic | Design brief for a bonkers Porsche 911 GT3 RS hero animation (hybrid render, HUD payoff) — **Krishna to brainstorm + build** | [`docs/animation/README.md`](animation/README.md) |
| F2 | Playwright E2E + axe in CI (hero animation, reduced-motion, dealer batch, contrast, a11y) — immediately caught & fixed a missing `<main>` landmark | `frontend-ci.yml`, 8/8 green |
| G (partial) | `evals.yml` — corpus/retrieval/model-study regression gate on data & ML PRs | `.github/workflows/evals.yml` |
| — | Hero: ambient appraisal-loop animation (scan → findings → price) + micro-life, reduced-motion safe | Playwright-verified |

**🪦 Retired by evidence (formal):**

- **Workstream C (RAG tuning) is retired**, not deferred: `RESEARCH.md` (D5 follow-up) proves the
  retriever already sits at the mathematical ceiling the corpus permits (same-make P@5 = 0.780,
  the exact data-bound maximum; 23/37 makes have <5 listings). C2–C4/C6 cannot move that number.
  What survives of C lives elsewhere: **C1/C5 = corpus growth + freshness**, which is the
  (now-repaired) Phase-E cron plus `scraped_at` accrual; **C7 (harder benchmark)** reopens only
  after the corpus grows. Re-evaluate the retirement at ~2–3k rows.

**⛔ Blocked — each on a named external dependency:**

| Item | Blocker |
|---|---|
| 0.1 W&B / 0.2 HF Hub / 0.4 Label Studio, DVC remote | accounts only you can create |
| A1–A8 CV training | Kaggle GPU + (A3/A4) labeling budget decision (§13.2) |
| B2 photo-aware pricing | retained photos (now accruing via 0.7) + Kaggle |
| B6 drift monitoring | meaningful only once the corpus actually grows |
| D1 at scale / D3 execution | GROQ/GEMINI keys · Kaggle GPU · §13.1 base-model decision |
| E1 cache / E4 observability / F7 analytics | Upstash · Sentry · PostHog accounts (+ §13.4 consent) |
| E3 registry, E6 /v1 API | API-contract decisions (owner call) |
| F1 tokens+Storybook · F4 Arabic/RTL · F5 alerts · F6 widget | multi-day product features + (F5) Supabase schema OPS |
| J live payments | §13.3 Stripe decision |

---

## 1. Baseline (where we are today)

| Component | Current | Known ceiling / gap |
|---|---|---|
| CV — damage detector | YOLOv8-s, mAP@0.5 **0.732**, 8 classes, in-browser ONNX | no severity/parts; fp32 44 MB; no domain (UAE) test set |
| Valuation ML | XGBoost quantile + split-conformal (80% coverage) + SHAP | tabular-only; 672-row corpus; no photo features |
| Retrieval RAG | hybrid (dense+BM25+structured) + rerank | **proven at data ceiling** (0.78) — corpus-bound |
| Chatbot | LLM (Gemini→Groq→template), Verifier-gated | API-dependent; no fine-tune; template-heavy |
| Backend | FastAPI + LangGraph, API keys, metering | no cache; no model registry; thin observability |
| Frontend | Next.js, on-device CV, charts, PWA, a11y 0 violations | no design-system tokens; no E2E in CI; no i18n |
| MLOps | eval scripts + GitHub Actions cron | no experiment tracking, data/model versioning, labeling |

---

## 2. Workstream 0 — MLOps & data foundation *(enables everything else)*

| ID | Task | Free tool | Acceptance |
|---|---|---|---|
| 0.1 | **Experiment tracking** across CV/ML/RAG/LLM runs | Weights & Biases (free personal) or MLflow | every training run logged with config + metrics + artifacts |
| 0.2 | **Model registry & weights hosting** | Hugging Face Hub (free) | each model versioned, downloadable, with a model card |
| 0.3 | **Data versioning** for the corpus + label sets | DVC + Git (HF Datasets as remote) | `dvc repro` reproduces the corpus + index from raw |
| 0.4 | **Labeling pipeline** (severity, parts, relevance) | Label Studio (self-host free) / Roboflow free | export YOLO-seg + classification formats |
| 0.5 | **Data validation gates** on the corpus | pandera / Great Expectations | schema + range checks block a bad scrape from merging |
| 0.6 | **Config-driven runs** (seeds, hydra-style) | Hydra / plain YAML | any experiment re-runs from one config file |
| 0.7 | **Retain scraped listing photos** (extend Phase-E scraper) | Apify + HF Datasets | ≥5k UAE listing images stored → unlabeled CV test set + D1 features |

**Sprint placement:** first — 0.1, 0.2, 0.7 unblock the research tracks; the rest follow in parallel.

---

## 3. Workstream A — Computer Vision (DL) training roadmap

**Goal:** move mAP up, add severity + part awareness, and prove the in-browser model is the best size/quality trade-off — all on Kaggle.

| ID | Task | Method | Data | Acceptance metric |
|---|---|---|---|---|
| A1 | **UAE domain test set** | run current detector on retained scraped photos; curate a held-out set | 0.7 photos | honest mAP on *real UAE* images (not just CarDD) |
| A2 | **Data expansion + augmentation** | add public damage datasets (Roboflow Universe) + mosaic/mixup/copy-paste/weather aug | CarDD + VehiDE + scraped | mAP@0.5 ≥ **0.78** (from 0.732) |
| A3 | **Severity head (D2)** | multi-task YOLO or a light classifier on crops; labels from CarDD damage-area buckets + ~300 hand-labels | Label Studio | severity macro-F1 ≥ 0.70; feeds repair-cost |
| A4 | **Part/panel segmentation** | YOLOv8-seg for bumper/door/lamp/windshield | ~300–500 hand-masks | itemized repair by *part*, not just class |
| A5 | **Backbone + TTA ablation** | YOLOv8-s vs m; test-time augmentation | — | pick best mAP-vs-latency point, reported honestly |
| A6 | **Active-learning loop** | detect on scraped photos → lowest-confidence crops → label → retrain (1 iteration) | 0.4 + 0.7 | mAP uplift from one AL round, documented as methodology |
| A7 | **Quantization study (D4)** | fp32 vs fp16 (fix Resize op-block-list) vs int8; measure mAP + latency + size on CarDD val | — | published table; choose the in-browser model on evidence |
| A8 | **Distillation → tiny student** | distill YOLOv8-m → nano student for faster in-browser inference | — | <10 MB model within ~2% mAP of teacher |

**Tracking:** W&B; **weights:** HF Hub; **serve:** onnxruntime-web (existing path).

---

## 4. Workstream B — Valuation ML roadmap

**Goal:** lower error and add photo-awareness, without ever overstating certainty.

| ID | Task | Method | Acceptance |
|---|---|---|---|
| B1 | **Corpus growth** (biggest lever) | Phase-E cron → 672 → several thousand rows | MAE ↓ as n ↑, tracked |
| B2 | **Photo-aware pricing ablation (D1)** | frozen DINOv2/CLIP embed of listing photos → PCA → append to XGBoost features | measured MAE **uplift vs tabular-only** (honest, may be null) |
| B3 | **Feature engineering** | brand tier, segment, trim parsed from title, mileage-per-year nonlinearity, city effects, `scraped_at` seasonality | ablation shows which features earn their place |
| B4 | **Model improvements** | monotonic constraints (price ↓ with age/mileage), ensemble XGB+LightGBM+CatBoost, Optuna tuning | MAPE ↓ vs current 19.6% with no monotonicity violations |
| B5 | **Uncertainty v2** | keep split-conformal; add CQR + **Mondrian (group-conditional) conformal** for per-segment coverage; calibration plots | 80% coverage *within each segment*, not just overall |
| B6 | **Drift monitoring** | Evidently (free) on feature/target drift as corpus grows | drift report in CI; retrain trigger when drift > threshold |

**Compute:** CPU/Kaggle; **track:** W&B; **tune:** Optuna.

---

## 5. Workstream C — Retrieval / RAG tuning roadmap

**Reminder from `RESEARCH.md`:** the retriever is **data-bound, not algorithm-bound** — so corpus growth dominates. Everything else is secondary and must be measured against a *harder* benchmark.

| ID | Task | Method | Acceptance |
|---|---|---|---|
| C1 | **Corpus growth** | same Phase-E pipeline | same-make P@5 ceiling rises as rare makes gain listings |
| C2 | **Reranker fine-tune / replace (D5)** | distill a cross-encoder on synthetic graded-relevance pairs (same make/model/year/mileage buckets) | nDCG@5 ↑ and it stops *hurting* hard queries |
| C3 | **Learned structured similarity** | replace hand-weights (0.30/0.15/0.55) with a small GBT/logistic scorer on pair features | ≥ current on the hard bench, no manual weights |
| C4 | **Query expansion** | LLM expands vehicle → trim/segment terms pre-retrieval | recall ↑ on rare models |
| C5 | **Freshness weighting** | decay by `scraped_at`; recency-aware ranking | comparables skew to recent listings once timestamps accrue |
| C6 | **Fusion study** | reciprocal-rank-fusion vs weighted-sum | pick the better fusion on nDCG |
| C7 | **Graded-relevance benchmark** | extend the hard bench with graded labels (0.4 labeling) | a benchmark that actually discriminates (not saturated) |

---

## 6. Workstream D — On-device fine-tuned chatbot ⭐ *(your chosen direction)*

**Goal:** a small LLM, fine-tuned on grounded valuation-QA, running **in the browser** (WebLLM / transformers.js) — free at scale, private, still Verifier-gated.

| ID | Task | Method | Acceptance |
|---|---|---|---|
| D1 | **Dataset construction** | generate grounded QA from the pipeline: evidence pack → question → cited answer. Teacher = Groq/Gemini; **gold-filtered by the Verifier** (only grounded answers kept). Include refusal + adversarial "invent a number" negatives. Target 3–10k pairs. | dataset where 100% of answers pass the Verifier |
| D2 | **Base model** | Qwen2.5-0.5B/1.5B-Instruct or Llama-3.2-1B-Instruct (permissive, WebLLM-supported) | chosen on eval, not vibes |
| D3 | **Fine-tune (LoRA/QLoRA)** on Kaggle | PEFT LoRA, seeds, W&B; held-out grounded-QA eval | faithfulness (Verifier pass) ≥ 0.98; refusal accuracy ≥ 0.9; beats template on LLM-judge win-rate |
| D4 | **On-device serving** | convert to MLC/WebLLM (q4) or transformers.js (ONNX); run in-browser; keep the client-side Verifier twin (`lib/assistant.ts`) as the hard gate | in-browser latency acceptable; model < ~1 GB q4; works offline |
| D5 | **Tool-use + multi-turn** | teach it to call `/estimate` for what-if questions; conversation memory; streaming | answers "what if 150k km?" by actually re-pricing |
| D6 | **Safety + fallback** | Verifier stays deterministic; off-topic classifier; fall back to the hosted API/template on low confidence | never serves an ungrounded number, model regardless |

**Why on-device is the right call:** it extends the exact thesis the CV already proves — the expensive part runs on the user's device, so it's free to operate and private by construction. The Verifier means even a small, occasionally-wrong model **cannot** quote a fabricated figure.

**Fallback ladder:** on-device fine-tune → hosted distilled model (HF free Inference) → Groq/Gemini API → deterministic template. Always one of these answers.

---

## 7. Workstream E — Backend architecture & scale

| ID | Task | Free tool | Acceptance |
|---|---|---|---|
| E1 | **Caching layer** | Upstash Redis (free) | repeat valuations/comparables served from cache; p50 latency ↓ |
| E2 | **Batch + async** | `/valuate/batch`, background jobs | dealers value 100 cars in one request without tripping limits |
| E3 | **Model registry + A/B** | load by version; flag two model versions; log which priced each request | can roll back a model and compare versions honestly |
| E4 | **Observability** | Sentry (errors) + PostHog (product analytics) + structured logs | every error captured; funnels visible; no PII leaked |
| E5 | **Data/retrain pipeline** | GitHub Actions (built) + validation gates + retrain trigger | corpus grows, reindexes, re-evals, and blocks on regression |
| E6 | **API maturity** | versioned `/v1`, OpenAPI, idempotency keys, webhooks, pagination | a third party can integrate from the docs alone |
| E7 | **Security hardening** | gitleaks + Dependabot (free), input fuzzing, RLS audit | secret-scan + dep-audit gate every PR |
| E8 | **Reliability** | keep-alive (built), readiness probes, LLM circuit-breaker | graceful degradation under provider outage, proven |

---

## 8. Workstream F — Frontend product & engineering

| ID | Task | Free tool | Acceptance |
|---|---|---|---|
| F1 | **Design system + tokens** | primitive→semantic→component tokens; Storybook; Chromatic free | one source of truth; AA contrast in both themes locked |
| F2 | **Testing in CI** | Playwright E2E + Vitest + axe + Lighthouse CI | green gate on every PR; a11y stays 0; perf budget enforced |
| F3 | **Performance** | code-split, lazy charts, image opt, CLS≈0 | Lighthouse ≥ 95 across the board |
| F4 | **Arabic / RTL (M10)** | next-intl + RTL audit + LLM-translated report (same citations) | full app usable in Arabic; report still Verifier-grounded |
| F5 | **Price alerts + watchlist** | Supabase + web push | user saves a car, gets notified when fair value shifts |
| F6 | **Embeddable widget + browser extension** | script/iframe embed; "value any Dubizzle listing" extension | a dealer embeds valuation on their site; extension prices a listing in place |
| F7 | **Product analytics + onboarding** | PostHog free | conversion + feature-usage funnels; honest activation metric |

---

## 9. Workstream G — Evaluation, observability & quality *(cross-cutting)*

- **Unified eval harness in CI:** CV mAP · ML MAE/coverage · RAG nDCG · chatbot faithfulness · E2E · a11y · Lighthouse — all reported to the public **`/model`** page (extend it into a live scorecard).
- **Regression gates (block merge):** faithfulness < 1.0 · conformal coverage drift · mAP drop · a11y > 0 · Lighthouse budget breach.
- **Model cards + datasheets** on HF for every model — honest limitations included.
- **Nightly continuous eval** on the freshly-grown corpus.

---

## 10. Free-tier tooling matrix

| Purpose | Tool | Free-tier note |
|---|---|---|
| GPU training / fine-tune | **Kaggle** | ~30h/wk P100/T4 — primary compute |
| Experiment tracking | Weights & Biases | free personal projects |
| Model + dataset hosting | Hugging Face Hub | free public repos, model cards |
| Data versioning | DVC + HF Datasets remote | free |
| Labeling | Label Studio (self-host) / Roboflow | free tiers |
| Data validation | pandera / Great Expectations | OSS |
| HP tuning | Optuna | OSS |
| Drift | Evidently | OSS free |
| Cache | Upstash Redis | free tier |
| Errors | Sentry | free dev tier |
| Product analytics | PostHog | generous free tier |
| E2E / visual / a11y / perf | Playwright · Chromatic · axe · Lighthouse CI | free / free tier |
| On-device LLM serving | WebLLM / transformers.js | OSS, runs in browser |
| CI + cron | GitHub Actions | 2,000 min/mo |
| Frontend / backend / DB | Vercel · Render · Supabase | existing free tiers |

---

## 11. Phased timeline (parallel research + product tracks)

**Sprint 1 — Foundation:** WS0 (tracking, HF registry, retain photos) · CV A1–A2 · ML B1 · Backend E1/E4 · Frontend F2.
**Sprint 2 — Research depth:** CV A3 (severity) + A7 (quantization) · ML B2 (photo-aware) + B4 · RAG C2 (reranker) · **Chatbot D1–D3 (dataset + LoRA)**.
**Sprint 3 — On-device + product:** **Chatbot D4–D5 (in-browser + tool-use)** · CV A4/A6 · ML B5 · Frontend F1/F4 · Backend E2/E3.
**Sprint 4 — Scale + polish:** Backend E5–E8 · Frontend F3/F5/F6 · RAG C3–C7 · WS-G unified eval + regression gates.
**Sprint 5 — Wow + GTM:** distillation A8 · price alerts + widget · public live scorecard · (optional) real payments.

Each sprint is one well-scoped fan-out; read the eval after each before starting the next.

---

## 12. Risks & honest constraints

- **Kaggle 30h/wk cap** — budget GPU time; prefer LoRA + small models; cache datasets on HF.
- **On-device LLM size vs quality** — a 0.5–1.5B q4 model is weaker than Groq; the **Verifier makes this safe** (can't fabricate numbers), and the fallback ladder covers hard questions.
- **Data scarcity is the real ceiling** (proven) — corpus growth and photo retention are prerequisites, not nice-to-haves.
- **Labeling effort** — severity/parts need a few hundred labels; scope tightly, use CarDD-derived weak labels first.
- **Free-tier limits** (Vercel deploys/day, Render sleep, Apify credits) — batch work, keep-alive, cron sparingly.

---

## 13. Open questions (to finalize before starting)

1. **On-device chatbot base model** — Qwen2.5-1.5B (stronger) vs 0.5B (smaller/faster in-browser)? Trade quality for load time.
2. **Labeling budget** — how many images can you realistically hand-label (drives A3/A4 scope)?
3. **Payments** — do you want a real Stripe live tier in scope, or keep test-mode?
4. **Analytics consent** — OK to add PostHog product analytics (privacy-respecting, self-hostable), or stay zero-tracking?
5. **Sequence preference** — lead with the **chatbot fine-tune** (most wow) or the **CV/ML training** (most research)? Both are Sprint-2, but which goes first?

---

*Say the word and I'll turn any workstream into an executable sprint — one at a time, verified at each gate. Nothing runs until you start it.*
