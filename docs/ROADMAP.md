# AutoValuate Intelligence — Roadmap & Implementation Plan

> Living document. Scores and priorities as of **2026‑07‑14**. Everything below is
> designed to be built **end‑to‑end on free tiers** unless explicitly marked otherwise.

---

## 1. Scorecard

Two honest lenses — the same product scores very differently depending on the bar.

| Lens | Score | One‑line verdict |
|---|---|---|
| **Portfolio / capstone project** | **90 / 100** | Genuinely strong: real DL, live, honest eval, traceable numbers. |
| **SaaS‑ready to pitch (commercial)** | **68 / 100** | A convincing MVP + demo, but missing monetization, a production CV path, dealer workflow, and data scale. |
| **Deployment‑ready** | **84 / 100** | Live and resilient; docked for Render cold‑start and CV being off in prod. |

### Sub‑scores (SaaS lens)

| Dimension | Score | Notes |
|---|---:|---|
| ML / DL technical depth | 9.0 / 10 | YOLOv8 (mAP 0.732), XGBoost quantile + split‑conformal, SHAP, hybrid RAG, LangGraph, Verifier gate. |
| Trust & evaluation | 9.0 / 10 | Faithfulness 1.000, honest conformal 0.776, Verifier grounds every number. Rare and valuable. |
| Data authenticity | 8.5 / 10 | Real Dubizzle scrape; synthetic set correctly rejected. **But only ~672 rows** — thin moat. |
| Core valuation UX | 8.5 / 10 | Clean flow, streaming trace, explainability, PDF, history, guest access. |
| UI / UX polish | 8.0 / 10 | Premium feel, dark/light, animated. Room for a design‑system pass + pro charts. |
| Live deployment & reliability | 7.5 / 10 | Vercel solid; Render cold‑start ~50s; **CV disabled in prod (RAM)**; backend auto‑deploy flaky. |
| Go‑to‑market assets | 7.0 / 10 | Deck + 15‑min script + market slides. No live pitch metrics / analytics story. |
| Extensibility & roadmap | 7.0 / 10 | Clean agent architecture; this doc closes the roadmap gap. |
| **SaaS infrastructure** | **3.0 / 10** | No billing, metering, usage tiers, dealer dashboard, API keys, or multi‑seat. Biggest gap. |
| **Data scale & moat** | **4.0 / 10** | Small corpus; no recurring data pipeline; no proprietary signal yet. |

### What moves the needle fastest (highest score‑per‑effort)

1. **Make damage detection actually run in production** → validates the headline "damage‑aware." Do it **in‑browser (WASM)** so it stays free. *(+CV, +reliability, +demo wow)*
2. **Conversational RAG assistant** over the valuation → turns a report into a product. *(+stickiness, +agentic story)*
3. **Professional analytics charts** (depreciation curve, price‑vs‑mileage, market position) → this is what a pitch audience remembers. *(+GTM, +UX)*
4. **Recurring data pipeline** (GitHub Actions cron scrape) → grows the corpus and unlocks *trend‑over‑time*, the beginning of a moat. *(+data, +moat)*

---

## 2. Where it stands

**Strengths:** hybrid CV + explainable tabular ML + agentic RAG; citation‑grounded reports with a deterministic Verifier; honest, held‑out evaluation; live on Vercel + Render free tiers; Supabase auth + guest access; PDF export; resilient offline/demo fallback.

**Gaps that matter for a commercial pitch:**
- No monetization surface (plans, metering, checkout) — even a stubbed one tells the story.
- CV is trained but **off in production** (Render RAM). The demo says "damage‑aware" but the live path skips it.
- Comparables corpus is small and static (no freshness, no trend).
- No dealer/B2B workflow (bulk valuation, API keys, saved fleet, white‑label).
- No product analytics (funnel, usage) to show traction in a pitch.

---

## 3. Feature backlog (prioritized)

Legend — **Effort:** S ≤1 day · M 2–4 days · L 1–2 weeks. **Cost:** all Free unless noted.

### P0 — build next (biggest impact, all free)

| # | Feature | What it is | Why | Effort | Status |
|---|---|---|---|---|---|
| P0‑1 | **In‑browser damage detection (WASM)** | Run the trained YOLOv8 ONNX with `onnxruntime-web` in the browser. No server RAM. Photos never leave the device → privacy win. | Makes the "damage‑aware" headline real & free; huge demo moment. | M | ✅ shipped (not pushed) |
| P0‑2 | **Conversational RAG assistant** | "Ask about this valuation" chat: grounded over the result + comparables + market, streaming, cited, with the same Verifier discipline. | Turns a one‑shot report into an interactive product; extends the agent story. | M | ⏳ Sprint 2 |
| P0‑3 | **Pro analytics charts** | Depreciation curve, price‑vs‑mileage scatter, market‑position percentile, comparables bar (see §6). | What a pitch audience remembers; makes the data tangible. | M | 🟡 partial (scatter+bars+market gauge+confidence gauge+severity radar done; depreciation curve needs Phase E) |
| P0‑4 | **What‑if sliders** | Live re‑valuation as the user drags mileage / condition / year. Debounced calls to the model. | "Interactive appraisal" feel; shows the model is real. | S–M | ✅ shipped (not pushed) |

### P1 — strong follow‑ups

| # | Feature | What it is | Why | Effort |
|---|---|---|---|---|
| P1‑1 | **Recurring data pipeline** | GitHub Actions cron → Apify scrape → append to comparables + snapshot prices for trend history. | Corpus growth + trend‑over‑time = the start of a moat. | M |
| P1‑2 | **Repair‑cost estimator** | Map detected damage class + severity → AED repair range → condition‑adjusted price. | Directly monetizable insight; ties CV to price. | M |
| P1‑3 | **Shareable report links + OG cards** | Public read‑only `/{r/:id}` page for a saved valuation; auto‑generated share image. | Virality + a real "send this to a buyer" use case. | S–M |
| P1‑4 | **Sell‑timing forecast** | Simple depreciation projection: "hold vs sell now" with expected value in N months. | Decision support beyond a point estimate. | M |

### P2 — SaaS / B2B (moves the "SaaS infra" score)

| # | Feature | What it is | Why | Effort |
|---|---|---|---|---|
| P2‑1 | **Dealer dashboard + bulk CSV** | Upload a CSV of cars → batch valuations → export. Saved "fleet." | The actual B2B wedge (dealers value inventory daily). | L |
| P2‑2 | **API keys + usage metering** | Issue keys, meter calls per key (Supabase table), quota tiers. | The "developer/API" revenue line; makes it a platform. | M |
| P2‑3 | **Plans & checkout (stub)** | Free / Pro / Dealer tiers with feature gating; Stripe **test mode** checkout (free to build). | Tells the monetization story in a pitch without real charges. | M |
| P2‑4 | **White‑label PDF** | Dealer logo + brand colors on the exported report. | Tangible paid‑tier perk. | S |

---

## 4. Chatbot (Conversational RAG) — implementation plan

**Goal:** a grounded assistant that answers "why this price?", "is this a good deal?", "how does mileage change it?", "what are similar cars?" — citing computed evidence and live comparables, never inventing numbers.

**Architecture (reuses the existing stack):**
- New LangGraph sub‑graph `chat_agent`: `retrieve → answer → verify`.
- **Retrieval:** the current hybrid retriever (fastembed MiniLM + BM25 + structured similarity) already returns comparables; extend the evidence pack with the valuation, SHAP drivers, condition, and confidence.
- **Answering:** Gemini → Groq → template fallback (existing `LLMClient`), system‑prompted to answer *only* from the evidence pack and cite `[ids]`.
- **Verifier reuse:** run the existing deterministic Verifier on the chat answer; if a number doesn't trace, strip/flag it. This is the differentiator — a *grounded* chatbot.
- **Transport:** new `POST /chat/stream` SSE endpoint (mirror `/valuate/stream`), per‑IP rate‑limited, threadpooled.
- **Frontend:** a docked chat panel under the report; message list, streaming tokens, citation chips reusing `lib/report.ts`.

**Free:** Groq/Gemini free tiers; no new infra.

**Effort:** M (2–4 days). **Depends on:** nothing — the retrieval + LLM + verifier already exist.

---

## 5. RAG tuning & CV training — do we need more?

### RAG — tuning > more training
The retriever is solid (P@5 = 1.0 on the benchmark) but the benchmark is small. Priorities:
1. **Grow the corpus** (P1‑1 cron) from ~672 → several thousand rows across makes/models. *This is the single biggest RAG quality lever.*
2. **Tune hybrid weights** (dense vs BM25 vs structured) with a proper grid + the faithfulness harness; log the chosen weights in `DECISIONS.md`.
3. **Rerank quality:** evaluate the torch‑free cross‑encoder vs a lighter scorer; measure nDCG@5, not just P@5.
4. **Query expansion:** expand the vehicle into a richer query (trim level, body, region) before retrieval.
5. **Freshness signal:** decay‑weight comparables by listing age once the cron gives timestamps.

*No model re‑training needed for RAG — it's embeddings + ranking. Corpus + weights + eval.*

### CV — a little more training pays off, but **shipping it matters more**
- **Ship first:** in‑browser WASM inference (P0‑1) — the model exists (mAP 0.732); the win is *deploying* it for free, not more epochs.
- **Then improve:**
  - **Severity head / regression** per damage (minor/moderate/severe) → feeds the repair‑cost estimator.
  - **More classes / part localization** (bumper, door, windshield) for itemized repair.
  - **More data / augmentation:** add real UAE listing photos (from the scrape) as an unlabeled test set; consider active‑learning labeling of the hardest cases.
  - **Quantize** the ONNX (int8) so it also fits a server path if needed.
- **Free training:** continue on Kaggle P100 (already wired: `krishna21052003/autovaluate-02-yolov8-finetune`).

**Verdict:** RAG → *tune + grow corpus* (no retrain). CV → *ship the trained model in‑browser now*, then a targeted severity/parts training round.

---

## 6. Charts & data‑viz — recommended (professional)

**Yes — a valuation product should be chart‑led.** Recommended set (dark/light‑aware):

| Chart | Type | Data | Purpose |
|---|---|---|---|
| **SHAP driver waterfall** | Horizontal diverging bars *(exists — polish)* | `explanation.top_factors` | Why this price. |
| **Price range + distribution** | Range bar with a distribution curve + mid marker | low/mid/high + comparables | Communicate uncertainty honestly. |
| **Depreciation curve** | Line + user's car as a plotted point | price vs age for the model | "Where your car sits on the curve." |
| **Price vs mileage** | Scatter, comparables + user's car highlighted | comparables | Instant market context. |
| **Market position** | Radial gauge / percentile bar | user mid vs comparable distribution | "Cheaper than 62% of similar cars." |
| **Comparables comparison** | Grouped bars | this estimate vs each comp | Side‑by‑side justification. |
| **Confidence gauge** | Radial gauge | interval width / level | Visualize trust at a glance. |
| **Damage severity radar** *(when CV on)* | Radar | per‑class findings | Condition breakdown. |

**Library recommendation:** **Recharts** (React, MIT, themeable via CSS vars) for line/scatter/bar/radar, and **keep bespoke SVG** for the SHAP waterfall + gauges (already hand‑rolled, pixel‑perfect, on‑brand). Rationale: Recharts is free, tiny, responsive, and easy to theme for both modes; bespoke SVG stays for the signature visuals. *(Alternative: `visx` if we want full control — more effort.)*

*Not implementing now — awaiting your go‑ahead on scope.*

---

## 7. UI / UX polish plan (dark + light)

**Design‑system pass:**
- Audit and lock **semantic tokens** (surface, surface‑2, fg, muted, accent, good/warn/bad, border, elevation) so both themes derive from one source; verify **WCAG AA (4.5:1)** for every text/background pair in both modes.
- One **elevation scale** for cards/sheets/popovers (no ad‑hoc shadows).
- Consistent **icon language** (Lucide, single stroke width) — already close.

**Micro‑interactions & motion:**
- Animated number count‑ups on the valuation reveal; spring‑based section entrance stagger; interruptible, `prefers-reduced-motion`‑aware.
- Chart entrance animations; hover tooltips with the same evidence chips.

**Flow & delight:**
- First‑visit **onboarding tour** (3 steps) and a richer empty state.
- **Command palette** (⌘K) for power users (new valuation, history, theme).
- Skeletons refined to match final layout (reduce CLS to ~0).

**Mobile & a11y:**
- Bottom‑sheet results on mobile; 44px touch targets; keyboard‑navigable chips and chat.
- Live‑region announcements already present — extend to chat + charts.

**Signature polish:**
- OG share cards (per §P1‑3), print stylesheet for the report, subtle brand motif carried across cards.

---

## 8. SaaS infrastructure (free‑tier stubs that tell the story)

- **Usage metering:** a `usage` table in Supabase (user_id, endpoint, ts); per‑tier quotas enforced in middleware.
- **Plans & gating:** Free / Pro / Dealer feature flags in a `plans` table; gate bulk, API keys, white‑label.
- **Checkout:** Stripe **test mode** (free) to demo the full purchase flow without charges.
- **API keys:** hashed keys in Supabase; metered; documented mini‑API reference.
- **Audit log:** append‑only valuation log for trust/enterprise story.

None of this requires leaving free tiers to *build and demo*.

---

## 9. Phased timeline

**Sprint 1 (the "wow" sprint):** ✅ P0‑1 in‑browser CV · 🟡 P0‑3 pro charts (gauges + radar done; depreciation curve deferred to Phase E) · ✅ P0‑4 what‑if sliders · ⏳ UX design‑system pass. *(Sprint‑1 code is in the working tree, not yet pushed.)*
**Sprint 2 (the "product" sprint):** P0‑2 chatbot · P1‑3 shareable links + OG cards · P1‑1 data cron.
**Sprint 3 (the "SaaS" sprint):** P2‑1 dealer bulk · P2‑2 API keys + metering · P2‑3 plans + test checkout · P1‑2 repair‑cost.

---

## 10. Free‑tier budget

| Service | Use | Tier | Limit to watch |
|---|---|---|---|
| Vercel | Frontend + in‑browser CV | Hobby | Bandwidth (WASM model ~10–20 MB, cache it). |
| Render | FastAPI backend | Free | 512 MB RAM, cold start ~50s. |
| Supabase | Auth, pgvector, usage, plans | Free | 500 MB DB, 50k MAU. |
| Groq / Gemini | LLM reports + chat | Free | RPM/RPD limits — keep the template fallback. |
| Kaggle | CV training | Free | P100, 30h/wk GPU. |
| GitHub Actions | Data cron + CI | Free | 2,000 min/mo. |
| Apify | Dubizzle scrape | Free credits | Monthly credit — cron sparingly. |
| Stripe | Test‑mode checkout | Free | Test mode = no real charges. |

---

## 11. Open questions (drive prioritization)

1. **Pitch context** — capstone/eval, investor, job portfolio, or competition? (Changes whether we optimize for depth, monetization story, or polish.)
2. **Build‑first order** — chatbot, in‑browser CV, charts, or dealer B2B?
3. **Strictly free**, or a small (~$5–10/mo) budget allowed for a production CV path / better LLM?
4. **UI scope** — full redesign pass or incremental polish?

---

*Maintained alongside `ARCHITECTURE.md` and `DECISIONS.md`. Update the scorecard as items ship.*
