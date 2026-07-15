# AutoValuate Intelligence — Production-Readiness & Accuracy Master Plan (v2)

> **The watertight, C-level, deploy-ready plan.** Grounded in current literature (July 2026),
> scoped to **100% free tiers**, and sequenced in two stages: **(1) a watertight demo** —
> everything live, reproducible, zero visible bugs, presentation-ready — then **(2) launch
> hardening** (domain, live payments, scale where free tier bottlenecks). Every workstream
> ends in a *measured* acceptance metric.
>
> **Status: PLAN ONLY. Nothing executes until Krishna says "start."**
> Companion docs: [`MASTER_PLAN.md`](MASTER_PLAN.md) (R&D dual-track) · [`RESEARCH.md`](RESEARCH.md) · [`ROADMAP.md`](ROADMAP.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## 0. The honesty frame (non-negotiable, and it's the moat)

The literature is clear and this plan refuses to lie about it:

- **Used-car price prediction tops out at ~92% (MAPE ≈ 7.6%, R² ≈ 0.94)** with large, clean data. **99% price accuracy is physically impossible** — negotiation, seller motivation and unseen condition are an irreducible noise floor. [JEDT], [Vehicles 2025]
- **Damage-detection SOTA is mAP ≈ 0.58–0.73** on CarDD; our current **0.732 already beats the published benchmarks**. [CarDD], [YOLOv8-hybrid]

So we chase **"best-achievable where it's bounded, and a real 99% where it isn't"**:

| Metric | 99% real? | This plan's target |
|---|---|---|
| Price MAPE | ❌ (floor ≈ 8%) | 19.6% → **~8–10%** |
| CV mAP@0.5 | ❌ (SOTA ≈ 0.73) | 0.732 → **~0.80** |
| Per-class precision on clear damage | ✅ | **>95%** |
| Report/assistant faithfulness (grounding) | ✅ | **≥99% (already 1.000)** |
| Conformal coverage (per-segment) | ✅ | **80% ±2 within every segment** |
| Uptime · test-pass · a11y · CLS | ✅ | **≥99% / 100% / 0 violations / 0** |

Surfacing this — with a public calibration plot and a live scoreboard — is the differentiator, not a weakness.

---

## 1. Scorecard → target

| Dimension | Now | Target (watertight) | Lever |
|---|---:|---:|---|
| Frontend | 92 | 96 | i18n/RTL, perf ≥95 Lighthouse, new visuals |
| Backend | 86 | 94 | cache, model registry + A/B, observability |
| DL — CV | 88 | 93 | YOLOv10 + segmentation + severity |
| ML — pricing | 74 | 88 | **data + photo-aware + ensemble** |
| RAG | 75 | 85 | corpus growth (proven lever) |
| Chatbot | 72 | 90 | **LoRA → on-device WebLLM** |
| Evaluation & honesty | 95 | 99 | live scoreboard + calibration plot |
| MLOps / infra | 84 | 94 | registry, drift, full CI gates |
| **Data scale** | **52** | **80** | **scrape 10k+ · retain photos · label** |
| SaaS / GTM | 72 | 86 (launch) | domain, live Stripe, monitoring |

---

## 2. Workstreams (all four tracks, sequenced end-to-end)

Legend — **Effort:** S ≤1d · M 2–4d · L 1–2wk. Compute: **Kaggle 30h/wk** + HF free hosting. Tracking: **Weights & Biases** (free). Registry: **Hugging Face Hub** (free).

### WS-A — Data foundation *(prerequisite — unblocks accuracy everywhere)*

| ID | Task | Free tool | Acceptance |
|---|---|---|---|
| A1 | **Scrape to 10k+ rows** — run the Apify cron hard across all makes × 7 emirates; dedupe by listing_id | Apify + GitHub Actions | corpus ≥ 10,000 rows, deduped, validated |
| A2 | **Retain listing photos** — extend scraper to store images to HF Datasets | Apify + HF Datasets | ≥ 5k UAE listing images → photo-aware features + real CV test set |
| A3 | **Hand-label severity + parts** — ~300–500 crops (minor/moderate/severe) + ~300 part masks | Label Studio (self-host) | exported YOLO-seg + classification sets |
| A4 | **Versioning + validation gates** — DVC + pandera checks block bad scrapes | DVC · pandera | `dvc repro` rebuilds corpus+index; CI blocks schema/range violations |
| A5 | **Drift monitoring** as the corpus grows | Evidently | drift report in CI; retrain trigger on threshold |

### WS-B — Pricing accuracy (19.6% → ~8–10% MAPE)

| ID | Task | Method | Acceptance |
|---|---|---|---|
| B1 | **Corpus growth impact** | re-train on 10k rows (A1) | MAPE drops, tracked vs row-count |
| B2 | **Photo-aware pricing (novel)** | frozen **DINOv2 + CLIP fusion** embeddings of listing photos → PCA → append to XGBoost features | measured MAE **uplift vs tabular-only** — honest ablation; no published car study exists, so this is a real contribution. [multimodal-house], [CLIP→DINO] |
| B3 | **Feature engineering** | trim/options parsed from title, brand tier, segment, mileage-per-year nonlinearity, city effects, `scraped_at` seasonality | ablation shows which features earn their place |
| B4 | **Ensemble + tuning** | ship the studied **monotonic constraints** (price ↓ with age/mileage) + **XGB/LightGBM/CatBoost ensemble** + Optuna | MAPE ↓, zero monotonicity violations |
| B5 | **Per-segment conformal** | ship **Mondrian (group-conditional) conformal** | 80% coverage **within each segment**, not just overall |

### WS-C — CV upgrade (0.732 → ~0.80 mAP)

| ID | Task | Method | Acceptance |
|---|---|---|---|
| C1 | **YOLOv10 + augmentation** | retrain on CarDD+VehiDE+scraped with mosaic/mixup/copy-paste | mAP@0.5 ≥ **0.78** |
| C2 | **Part + damage segmentation** | YOLOv8/10-seg — **21 parts × 8 damages** hybrid | itemized repair *by part*. [YOLOv8-hybrid] |
| C3 | **Severity head** | multi-task or crop classifier on A3 labels | severity macro-F1 ≥ 0.70 → feeds repair-cost |
| C4 | **Active-learning round** | detect on A2 photos → lowest-confidence crops → label → retrain | documented mAP uplift from one AL iteration |
| C5 | **Quantization study** | fp32 vs fp16 vs int8; mAP + latency + size on CarDD val | pick the in-browser model on evidence; keep <45 MB or shrink |

### WS-D — On-device fine-tuned chatbot (LoRA → WebLLM)

Grounded: WebLLM runs Qwen2.5/Llama-3.2-1B in-browser at **~80% native speed** (WebGPU); W4A4 quant holds **94–96% accuracy**. [WebLLM], [web-llm]

| ID | Task | Method | Acceptance |
|---|---|---|---|
| D1 | **Grounded QA dataset** | generate from evidence packs, **Verifier-filtered** (only grounded answers) + refusal/adversarial negatives; target 5–10k pairs | 100% of training answers pass the Verifier |
| D2 | **LoRA fine-tune on Kaggle** | Qwen2.5-1.5B or Llama-3.2-1B, PEFT, W&B tracked | faithfulness ≥ 0.98, refusal acc ≥ 0.9, beats template on LLM-judge |
| D3 | **On-device serving** | convert to MLC/WebLLM (q4), run in-browser, keep the client-side Verifier gate | works offline; <1 GB q4; can't quote an ungrounded number |
| D4 | **Tool-use + multi-turn** | call `/estimate` for what-if; conversation memory; streaming | answers "what if 150k km?" by actually re-pricing |
| D5 | **Fallback ladder** | on-device → hosted distilled (HF free) → Groq/Gemini → template | always a grounded answer |

### WS-E — New visuals & findings *(you asked for more graphs + realistic findings)*

| ID | Feature | What it shows | Efficient because |
|---|---|---|---|
| E1 | **Confidence-calibration plot** | reliability diagram (predicted vs actual coverage) | visualizes the honesty; computed from the held-out set, no live cost |
| E2 | **UAE damage heatmap** | aggregate browser-scan findings onto a car diagram — "where UAE cars get hit" | proprietary-data story; client-side aggregation |
| E3 | **Depreciation curve** | price vs age for the model, your car plotted | one query over the grown corpus |
| E4 | **Deal-score** | percentile of asking vs fair value → 0–100 "deal score" | pure arithmetic on existing outputs |
| E5 | **Anomaly / "too-good-to-be-true" flag** | outlier detection: listing priced far from model → possible fraud/odometer issue | isolation-forest on features, cheap |
| E6 | **Live sensitivity chart** | what-if slider drives a price-vs-mileage sensitivity curve in real time | reuses `/estimate` |
| E7 | **SHAP beeswarm (market)** | global feature impact across the corpus | one batch SHAP pass |
| E8 | **Live model report-card dashboard** | extend `/model`: mAP, MAPE, coverage, faithfulness, uptime — all live, all honest | reads the eval JSONs already in CI |

### WS-F — Backend hardening (watertight)

| ID | Task | Free tool | Acceptance |
|---|---|---|---|
| F1 | **Cache** valuations/comparables/embeddings | Upstash Redis | repeat requests from cache; p50 latency ↓ |
| F2 | **Model registry + A/B** | load by version; log which model priced each request | rollback + honest version comparison |
| F3 | **Observability** | Sentry (errors) + PostHog (funnels) | every error captured; no PII leaked |
| F4 | **Security gates** | gitleaks + Dependabot (already in CI) + input fuzzing + RLS audit | secret-scan + dep-audit block every PR |
| F5 | **Reliability** | keep-alive (done) + readiness + LLM circuit-breaker (done) | graceful degradation proven under outage |

### WS-G — Frontend polish

| ID | Task | Acceptance |
|---|---|---|
| G1 | **Arabic / RTL (M10)** | full app usable in Arabic; report still Verifier-grounded |
| G2 | **Performance** | Lighthouse ≥ 95 across the board; CLS stays 0 |
| G3 | **Design-system tokens + Storybook + Chromatic** | one source of truth; AA locked both themes |
| G4 | **Wire E1–E8 visuals** | each responsive, dark/light, a11y-clean |

### WS-H — Evaluation & the "99% where real" scoreboard

- Unified CI harness already runs CV/ML/RAG/chatbot/E2E/a11y; **extend `/model` into a live public scoreboard** showing faithfulness, coverage, uptime, a11y all at ≥99% and price/CV at their honest best-achievable numbers.
- **Regression gates block merge** if faithfulness < 1.0, coverage drifts, mAP drops, a11y > 0, or Lighthouse budget breaks.
- **Model cards + datasheets** (HF) for every model, limitations included.

---

## 3. Two-stage sequencing

### Stage 1 — WATERTIGHT DEMO (presentation-ready, zero visible bugs)
*Goal: a stranger opens the live URL, everything works flawlessly, and it's fully reproducible + defensible.*

1. **Ops lock** — SMTP (Brevo, in progress), Supabase SQL for API keys, key rotation, confirm every committed feature is live once Vercel/Render caps reset.
2. **WS-A1 + A4** (grow corpus to a few thousand + validation) → **WS-B1/B3/B4/B5** (retrain, ensemble, monotonic, Mondrian) → measurable MAPE drop.
3. **WS-E1–E8 visuals** wired (the demo "wow" + the honesty scoreboard).
4. **WS-D1–D3** on-device chatbot shipped (biggest wow).
5. **WS-C1** CV bump to ~0.78 if Kaggle time allows.
6. **Full acceptance gate** (§4) green; deck + script updated with the new numbers.

### Stage 2 — LAUNCH HARDENING (real product)
1. **Custom domain** + SSL; **Stripe live mode**; paid-tier only where free tier is the true bottleneck (e.g. CV inference scale, DB size).
2. **WS-F** full (cache, registry+A/B, Sentry/PostHog).
3. **WS-A2/A3 + B2 + C2/C3/C4** — photo-aware pricing + segmentation + severity (the deeper, data-heavy research wins).
4. **WS-G1** Arabic/RTL for UAE market credibility.
5. **WS-D4/D5** tool-use + fallback ladder; **WS-H** live scoreboard public.

---

## 4. Definition of "watertight / done" (acceptance gates)

A change ships only when **all** hold:
- `npm run build` clean · `./eval/run_all.sh` green · all CI gates pass.
- Works dark + light, responsive 320→1440, **0 WCAG AA violations**, CLS 0, Lighthouse ≥ 95.
- Free-tier only; secrets via env, never committed; gitleaks clean.
- Every model has a held-out metric + model card; **no metric regresses**.
- Live-verified in a real browser end-to-end (the standard already used this session).
- Faithfulness stays **1.000**; conformal coverage stays calibrated.

---

## 5. Free-tier tooling matrix

| Purpose | Tool | Note |
|---|---|---|
| GPU training / LoRA | **Kaggle** | ~30h/wk — primary |
| Experiment tracking | Weights & Biases | free personal |
| Model + dataset hosting | Hugging Face Hub | free public repos |
| Data versioning | DVC + HF Datasets | free |
| Labeling | Label Studio (self-host) | free |
| Data validation / drift | pandera · Evidently | OSS |
| HP tuning | Optuna | OSS |
| Cache | Upstash Redis | free tier |
| Errors / analytics | Sentry · PostHog | free tiers |
| On-device LLM | WebLLM / transformers.js | OSS, in-browser |
| CI + cron | GitHub Actions | 2,000 min/mo |
| Front/back/DB | Vercel · Render · Supabase | existing |
| Payments (Stage 2) | Stripe | test now, live at launch |

---

## 6. Risks & honest constraints

- **Data is the ceiling** — every accuracy target depends on WS-A landing first. This is sequenced first for exactly that reason.
- **The ~8% MAPE floor is real** — we hit best-achievable and *say so*; we do not fake 99% on price.
- **Kaggle 30h/wk** — budget across CV (YOLOv10) + LoRA; prefer small models, cache datasets on HF.
- **Free-tier deploy caps** (Vercel 100/day, Render sleep, Apify credits) — batch work, keep-alive, cron sparingly.
- **On-device LLM is weaker than Groq** — the Verifier makes that safe (can't fabricate numbers); fallback ladder covers hard questions.

---

## 7. Ops the user controls (outside code)

- Finish **Brevo SMTP** (in progress) + run `supabase_api_keys_schema.sql`.
- Rotate Supabase keys; add `APIFY_TOKEN` (done) and any new secrets (W&B, HF, Upstash, Sentry) as GitHub/Render env.
- Stage 2: custom domain + Stripe live keys.
- 4th team member name → deck/script/README.

---

## Sources

- Used-car price ML benchmarks (MAPE 7.62%, R² 0.94; tree ensembles dominate): [JEDT](https://ph01.tci-thaijo.org/index.php/TNIJournal/article/view/263449) · [Vehicles 2025](https://doi.org/10.3390/vehicles7030094) · [ICMLT 2024](https://dl.acm.org/doi/10.1145/3674029.3674032)
- Car damage detection SOTA (CarDD mAP ≈ 0.58; YOLOv8/10 hybrid, part+damage segmentation): [CarDD](https://cardd-ustc.github.io/) · [YOLOv8 hybrid](https://www.researchgate.net/publication/391528778) · [dent dataset](https://arxiv.org/pdf/2508.15431)
- On-device LLM (WebLLM ~80% native via WebGPU; W4A4 94–96%): [WebLLM paper](https://arxiv.org/html/2412.15803v2) · [mlc-ai/web-llm](https://github.com/mlc-ai/web-llm)
- Multimodal / photo-aware price prediction (image embeddings help; CLIP+DINO fusion): [multimodal house prices](https://arxiv.org/pdf/2409.05335) · [CLIP→DINO](https://arxiv.org/html/2310.08825v3)

---

*End of plan. Say "start" and I'll turn any single workstream into an executable sprint — one measured gate at a time. Nothing runs until then.*
