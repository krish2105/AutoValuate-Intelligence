# AutoValuate Intelligence — Remaining Implementation Plan (for Yash)

> **Owner of remaining work:** Yash Petkar (AS25DXB020)
> **Status date:** 2026‑07‑14
> This is the execution guide for everything **not yet built**. Read together with
> [`ROADMAP.md`](ROADMAP.md) (strategy + scoring) and [`ARCHITECTURE.md`](ARCHITECTURE.md).
> Everything here is designed to run on **free tiers only**.

---

## ✅ MVP progress (Sprint 1 "wow" — shipped 2026‑07‑14, in working tree, **not yet pushed**)

The Sprint‑1 code is built and verified locally. **Nothing is pushed yet** (per instruction) —
commit + deploy when ready.

| Item | Status | Notes |
|---|---|---|
| **Phase A — In‑browser YOLOv8 (WASM)** | ✅ Done | Runs the trained detector fully on‑device with `onnxruntime-web`; overlays damage boxes, computes a condition score, and condition‑adjusts the price. Verified end‑to‑end in a real browser (session load 660 ms, inference 877 ms, output `[1,12,8400]`; decode/NMS parity with `cv_local.py`). |
| **Phase B — What‑if sliders + `/estimate`** | ✅ Done | New `POST /estimate` (model‑only, no RAG/LLM) + debounced sliders (mileage/year/condition) with a local optimistic fallback when the backend is cold. Verified: mileage 90k→210k km moved the estimate 33,184→28,709 AED. |
| **Phase L charts (no new data)** | ✅ Done | Confidence gauge (`confidence-panel.tsx`), market‑position radial gauge (`market-analytics.tsx`), and damage‑severity radar (`damage-report.tsx`). All theme‑aware; verified rendering (gauges + 3‑axis radar polygons). |
| **"Grand Marque" UI pass** (Phase L, partial) | ✅ Done | Luxury‑automotive frontend treatment: cinematic hero with a self‑drawing GT line‑art SVG + pointer spotlight + telemetry ticker (`components/hero.tsx`, `hero-car.tsx`), Archivo expanded‑caps display font, film‑grain overlay, magnetic CTA with shine sweep, odometer count‑ups on all AED values, spec‑sheet section titles (`components/fx.tsx`, `ui.tsx`, `valuation-dashboard.tsx`). All reduced‑motion safe, both themes. |
| OPS‑1…4 | ⏳ You | External dashboard actions (Render/Supabase) — **cannot be automated from code**; do these to light up the live backend paths. |

**What changed (files):** `frontend/lib/cv-browser.ts` (new), `frontend/components/browser-cv.tsx`
(new), `frontend/components/what-if.tsx` (new), `frontend/components/gauges.tsx` (new),
`frontend/scripts/copy-ort.mjs` (new), edits to `vehicle-form.tsx`, `damage-report.tsx`,
`confidence-panel.tsx`, `market-analytics.tsx`, `app/page.tsx`, `lib/api.ts`, `lib/types.ts`,
`next.config.mjs`, `package.json`; backend `main.py` (`/estimate` + `ClientCondition`) and
`graph/orchestrator.py` (`estimate()` + browser‑condition passthrough). `frontend/public/models/best.onnx`
is committed; `frontend/public/ort/` is build‑generated (gitignored).

> **ORT bundling note:** we load ORT's self‑contained wasm bundle from `/public/ort` via a
> native `webpackIgnore` dynamic import — Next/Terser can't minify ORT's `import.meta.url`
> wasm glue, so we keep the bundler out of it entirely. `scripts/copy-ort.mjs` (predev/prebuild)
> stages the `.mjs` + `.wasm` from `node_modules`.

---

## 0. Where the project stands (already done — do NOT rebuild)

**Live:** frontend `https://auto-valuate-intelligence.vercel.app` (Vercel) → backend
`https://autovaluate-api.onrender.com` (Render free) → Supabase (auth + pgvector).

**Complete & shipped:**
- Phases 1–11 of the original build (CV training, XGBoost valuation + conformal + SHAP, hybrid RAG, LangGraph orchestration, Verifier, Next.js UI, eval harness, CI/CD, README, deck).
- Trained YOLOv8 detector — `cv-service/model/best.onnx` (mAP@0.5 = 0.732, 8 damage classes).
- Backend hardening (threadpool, rate limit, CORS, payload caps), torch‑free RAG (fastembed).
- Supabase Auth + guest access ("Continue without an account") + saved history.
- PDF export **with the citation/blank bug fixed** (see `frontend/lib/report.ts` — tokenizer, `normalizeCitationOrder`, `isMessyReport` → clean deterministic template fallback).
- **Market‑analytics charts** (`frontend/components/market-analytics.tsx`, Recharts, dark/light): price‑vs‑mileage scatter + estimate‑vs‑comparables bars + market‑position percentile. **This is the only charts work done so far.**

**Recharts is already installed.** `onnxruntime-web` is **not** yet installed.

---

## 1. Ground rules (apply to every phase)

1. **Free tier only.** No paid services. In‑browser inference keeps CV free.
2. **Dark + light must both look great.** Use the existing semantic tokens (`--bg, --surface, --surface-2, --border, --fg, --muted, --accent, --info, --good, --warn, --bad`) in `frontend/app/globals.css`. For charts/SVG read them as `hsl(var(--token))`. Verify WCAG AA (4.5:1) in both themes.
3. **Reuse the design system:** `SectionCard`, `Pill`, `Reveal` from `components/ui.tsx`; motion via framer‑motion with `prefers-reduced-motion` respected.
4. **Verify every phase** with `npm run build` (frontend) and the eval scripts (`./eval/run_all.sh`) before committing.
5. **Commit convention:** `feat(scope): …` / `fix(scope): …`, end with the Co‑Authored‑By trailer already used in the repo.
6. **Local dev:** backend `cd backend-api && USE_TF=0 uvicorn main:app --port 8000`; frontend `cd frontend && npm run dev` with `frontend/.env.local` → `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`.

---

## 2. Ops prerequisites (do these FIRST — they unblock backend features)

| # | Task | Why | How |
|---|---|---|---|
| OPS‑1 | **Fix Render auto‑deploy** | Backend pushes were NOT auto‑deploying (live API served stale code). Chatbot / what‑if / API‑keys all depend on the backend. | Render dashboard → the `autovaluate-api` service → **Settings → Build & Deploy → Auto‑Deploy = Yes**, branch `main`. Confirm with a trivial commit → watch it deploy. |
| OPS‑2 | **Run the saved‑valuations SQL** | Cloud history 404s until the table exists. | Supabase → SQL Editor → run `backend-api/agents/supabase_valuations_schema.sql`. |
| OPS‑3 | **Disable email confirmation** (optional) | Instant sign‑up for demos. | Supabase → Authentication → Providers → Email → "Confirm email" off. |
| OPS‑4 | **Rotate Supabase keys** | The service_role key was pasted in chat during setup. | Supabase → Settings → API → reset; update Render env + `frontend/lib/supabase.ts` anon default. |

---

## 3. Build phases (in order)

Legend — **Effort:** S ≤1d · M 2–4d · L 1–2wk. All **free**.

---

### Phase A — In‑browser damage detection (WASM)  · Effort M · P0‑1 · ✅ SHIPPED (not pushed)

**Goal:** run the trained YOLOv8 in the browser with `onnxruntime-web`, overlay damage boxes on the uploaded photo, produce a condition score. Photos never leave the device (privacy win) and it's free (no server RAM).

**Model facts (already verified):**
- File: `cv-service/model/best.onnx`, 44.8 MB fp32.
- Input `images`: `float32 [1,3,640,640]`, RGB, `/255`, letterboxed (pad colour 114), NCHW.
- Output `output0`: `float32 [1,12,8400]` → transpose to `[8400,12]`. Cols 0‑3 = `cx,cy,w,h` (pixels in 640 space); cols 4‑11 = 8 class probabilities (already sigmoid).
- Classes: `["dent","scratch","crack","glass_shatter","lamp_broken","tire_flat","punctured","missing_part"]`.
- Thresholds: `CONF=0.35`, `IOU=0.45`. **Reference decoder to port: `backend-api/agents/cv_local.py` (`_letterbox`, `_nms`, `detect`).**

**Model delivery (important):** Vercel builds from the `frontend/` root, so the model must live under `frontend/public/`. Two options:
- **Simplest:** copy `cv-service/model/best.onnx` → `frontend/public/models/best.onnx` and commit (adds 44 MB to git; acceptable, loads lazily + cached).
- **Better UX (try, don't block on it):** produce a smaller model. int8 dynamic quant deflates confidence (max 0.53→0.27, ~0.93 corr) — if used, drop the browser threshold to ~0.22 **and validate on a real damaged‑car photo**. fp16 via `onnxconverter-common` currently fails on this graph (Resize/Cast type errors) — skip unless you fix the op block list. **Recommendation: ship fp32 first, optimize later.**

**Steps:**
1. `cd frontend && npm i onnxruntime-web`.
2. Serve ORT's wasm binaries locally (avoid CDN): copy `node_modules/onnxruntime-web/dist/*.wasm` → `frontend/public/ort/` via a `prebuild`/`predev` script, and set `ort.env.wasm.wasmPaths = "/ort/"`. Use the `wasm` execution provider (WebGL/WebGPU optional later).
3. `frontend/lib/cv-browser.ts`:
   - `loadSession()` — lazy `ort.InferenceSession.create("/models/best.onnx", {executionProviders:["wasm"]})`, memoized.
   - `preprocess(img: HTMLImageElement|ImageBitmap)` — draw to a 640×640 canvas with letterbox, read `ImageData`, build the `Float32Array` NCHW `/255`. Return `{tensor, ratio, padW, padH, origW, origH}`.
   - `decode(output, meta)` — transpose, argmax over the 8 class cols, filter `>CONF`, cx/cy/w/h→xyxy, per‑class NMS (`IOU`), map back to original image coords (divide by ratio), return `[{label, confidence, box:[x1,y1,x2,y2] normalized}]`.
   - `conditionScore(dets)` — mirror the backend severity weighting so the score matches server logic (see `aggregation_agent.py` / `cv-service`).
4. UI `frontend/components/browser-cv.tsx`:
   - After photo upload (existing dropzone in `vehicle-form.tsx`), run detection with a "Scanning…" state (worker or `requestIdleCallback` so the UI doesn't freeze).
   - Overlay boxes on the image (absolutely‑positioned divs or a canvas), colour by class, label + confidence.
   - Show a condition score and per‑class chips, replacing the current "Visual damage assessment — not run" empty state in `components/damage-report.tsx` when a browser scan exists.
5. **Feed price:** send the browser‑computed condition (score + findings) to the backend so the valuation is condition‑adjusted. Add an optional `client_condition` field to `ValuationRequest` in `backend-api/main.py`; when present, the aggregation step uses it instead of server CV. Keep it optional and validated.

**Acceptance:** upload a damaged‑car photo → boxes appear, condition score shown, valuation reflects condition. Works offline after first model load. No main‑thread freeze. Both themes.

---

### Phase B — What‑if sliders + fast `/estimate` endpoint · Effort S–M · P0‑4 · ✅ SHIPPED (not pushed)

**Goal:** drag mileage / year / condition → live re‑valuation without re‑running RAG + LLM.

**Steps:**
1. Backend: add `POST /estimate` in `main.py` that runs **only** `models/valuation_model.py` (no comparables, no report). Return `{valuation}`. Reuse `ValuationRequest`. Rate‑limited + threadpooled like `/valuate`.
2. Frontend `components/what-if.tsx`: sliders (mileage, year, condition) seeded from the current result; debounce ~400 ms; call `/estimate`; show new mid + Δ vs original with an animated delta and a mini range bar. Guard against spamming (abort in‑flight).
3. Place under the valuation dashboard; collapse by default on mobile.

**Acceptance:** dragging updates the number in <1 s (warm backend); Δ shows +/‑ vs baseline; no request storms.

---

### Phase C — Conversational RAG assistant · Effort M · P0‑2

**Goal:** grounded chat about the valuation ("why this price?", "good deal?", "how does mileage change it?"), cited, Verifier‑checked.

**Steps:**
1. Backend `agents/chat_agent.py` (or a LangGraph sub‑graph `retrieve → answer → verify`):
   - Build an evidence pack from the valuation + SHAP drivers + condition + comparables (reuse `report_agent.build_evidence`).
   - Retrieval: reuse the hybrid retriever in `comparables_rag_agent.py` for follow‑ups needing more comps.
   - Answer via `llm_client/client.py` (Gemini→Groq→template), system‑prompted to answer **only** from evidence and cite `[ids]`.
   - Run the existing **Verifier** (`verifier_agent.py`) on the answer; strip/flag ungrounded numbers.
2. Backend endpoint `POST /chat/stream` (SSE, mirror `/valuate/stream`): input = `{session_context, message, history}`; stream tokens + a final `citations`/`verification` event. Rate‑limit per IP.
3. Frontend `components/assistant.tsx`: docked panel under the report; streaming message list; reuse `lib/report.ts` citation chips; suggested prompts. Wire into `app/page.tsx` under `SellerReport`.

**Acceptance:** ask 3 questions → grounded, cited answers; a deliberately unanswerable numeric question is refused/flagged by the Verifier. Streams smoothly. Works when backend is up (needs OPS‑1).

---

### Phase D — Shareable report links + OG cards · Effort S–M · P1‑3

**Goal:** public read‑only page for a saved valuation + an auto‑generated share image.

**Steps:**
1. Supabase: add a nullable `public_slug` (unique) to `valuations`; add an RLS `select` policy allowing anonymous read **only** when `public_slug` matches the requested slug. SQL alongside the existing schema file.
2. Frontend route `app/r/[slug]/page.tsx` — server component fetches by slug (anon client), renders a read‑only version of the dashboard (no form, no history). Add a "Share" button on the result that mints a slug and copies the URL.
3. OG image: `app/r/[slug]/opengraph-image.tsx` using Next `ImageResponse` (free, no external service) — car, mid value, range, condition.

**Acceptance:** click Share → get a public URL that opens for a logged‑out user and shows a rich preview card when pasted into chat/social.

---

### Phase E — Recurring data pipeline (corpus growth) · Effort M · P1‑1

**Goal:** grow comparables from ~672 rows and capture price snapshots for trend‑over‑time. Biggest RAG‑quality lever.

**Steps:**
1. `.github/workflows/scrape.yml` — scheduled (e.g. weekly) GitHub Action: run the Apify actor `agenscrape/dubizzle-uae-scraper` (input `{startUrl, maxResults}`; use make‑filtered URLs like `/motors/used-cars/toyota/` for diversity), dedupe by `listing_id`, append to the dataset, and re‑embed into Supabase pgvector (`agents/load_comparables_supabase.py`). Secret: `APIFY_TOKEN`.
2. Add a `scraped_at` timestamp; keep historical snapshots for depreciation trends.
3. After growth, re‑tune retrieval (Phase L‑charts depreciation curve benefits).

**Acceptance:** manual run of the workflow adds fresh, deduped rows; retrieval still passes the faithfulness/benchmark evals.

---

### Phase F — Repair‑cost estimator · Effort M · P1‑2

**Goal:** damage class (+ severity) → AED repair range → condition‑adjusted price delta.

**Steps:**
1. Add a severity signal to CV (from Phase A findings: box area, confidence, class). Optionally train a severity head later (Kaggle) — not required for v1.
2. Backend `agents/repair_cost.py`: a transparent lookup table (class × severity → AED range for the UAE), summed across findings; expose in the valuation result.
3. Frontend: show an itemized repair estimate in `damage-report.tsx` and reflect it in the confidence/price narrative.

**Acceptance:** a car with a detected dent + scratch shows an itemized AED repair range and a corresponding price adjustment.

---

### Phase G — Sell‑timing forecast · Effort M · P1‑4

**Goal:** "hold vs sell now" — projected value over the next N months.

**Steps:**
1. Fit a simple depreciation curve per segment from the (grown) corpus — value vs age; project the user's car forward 3/6/12 months.
2. Frontend: a small line chart (Recharts) + a one‑line recommendation. Keep honest error bars.

**Acceptance:** shows a projected value path with a clear, caveated recommendation.

---

### Phase H — Dealer dashboard + bulk CSV · Effort L · P2‑1

**Goal:** the B2B wedge — value a fleet at once.

**Steps:**
1. Frontend `app/dealer/page.tsx` (auth‑gated): CSV upload → parse (make,model,year,km,…) → batch calls to `/estimate` (or a new `/valuate/batch`) → results table with sort/filter → CSV export.
2. Supabase: a `fleets` table (user‑scoped, RLS) to save/reload.
3. Handle rate limits gracefully (queue + progress).

**Acceptance:** upload a 20‑row CSV → get a valued table → export. Saved fleet reloads per user.

---

### Phase I — API keys + usage metering · Effort M · P2‑2

**Goal:** the "platform/API" story with quotas.

**Steps:**
1. Supabase: `api_keys` (hashed key, user_id, tier, created_at) + `usage` (key_id, endpoint, ts) tables, RLS.
2. Backend: accept `Authorization: Bearer <key>`; middleware validates + meters + enforces per‑tier quotas (extend the existing rate‑limit middleware).
3. Frontend: a "Developers" page to mint/revoke keys, show usage; a short API reference (`docs/API.md`).

**Acceptance:** a minted key authorizes `/valuate`; usage increments; quota exceed → 429 with a clear message.

---

### Phase J — Plans + Stripe test checkout · Effort M · P2‑3

**Goal:** tell the monetization story with zero real charges.

**Steps:**
1. Supabase: `plans`/`subscriptions` tables; Free / Pro / Dealer feature flags gating bulk, API keys, white‑label.
2. Stripe **test mode** (free): checkout session + webhook (a Next route or a backend endpoint) to flip the subscription flag. Use test keys only.
3. Frontend: pricing page + gated UI states.

**Acceptance:** full test‑mode purchase flow flips the tier and unlocks gated features. No real money.

---

### Phase K — White‑label PDF · Effort S · P2‑4

**Goal:** dealer logo + brand colour on the exported report.

**Steps:** extend `frontend/lib/pdf.ts` to accept a brand (logo data‑URL + accent hex) from the dealer's saved settings; render in the header. Gate to the Dealer tier.

**Acceptance:** a dealer's report shows their logo + colour; free tier unchanged.

---

### Phase L — Full UI/UX redesign pass + remaining charts · Effort L

**Design system:**
- Audit and lock all semantic tokens; verify AA contrast in **both** themes for every text/bg pair.
- One elevation scale (cards/sheets/popovers); one icon language (Lucide, single stroke width).
- Motion: number count‑ups on reveal, staggered section entrance, interruptible, `prefers-reduced-motion` aware.

**Flow & delight:** first‑visit onboarding tour (3 steps); richer empty states; ⌘K command palette (new valuation, history, theme); refined skeletons to cut CLS ≈ 0.

**Mobile & a11y:** bottom‑sheet results on mobile; 44 px touch targets; keyboard‑navigable chips + chat; extend the existing aria‑live announcements to chat and charts.

**Remaining charts to add** (Recharts, theme‑aware; scatter + estimate‑bar already done):
| Chart | Type | Data | Status |
|---|---|---|---|
| Depreciation curve | line + user point | price vs age for the model (needs Phase E corpus) | ⏳ needs Phase E |
| Market‑position gauge | radial | user mid vs comparable distribution | ✅ shipped (`gauges.tsx` → `market-analytics.tsx`) |
| Confidence gauge | radial | interval width / level (in `confidence-panel.tsx`) | ✅ shipped (`gauges.tsx` → `confidence-panel.tsx`) |
| Damage severity radar | radar | per‑class CV findings (needs Phase A) | ✅ shipped (`damage-report.tsx`, Phase A findings) |
| SHAP waterfall | keep bespoke SVG | polish only (`shap-waterfall.tsx`) | ⏳ polish |

**Acceptance:** a designer‑grade pass in both themes; Lighthouse a11y ≥ 95; all charts responsive and readable on mobile.

---

## 4. Suggested sprint order

- **Sprint 1 (wow):** OPS‑1..4 → Phase A (in‑browser CV) → Phase B (what‑if) → Phase L charts that don't need new data (confidence gauge, market gauge, severity radar).
- **Sprint 2 (product):** Phase C (chatbot) → Phase D (shareable links) → Phase E (data cron) → depreciation curve.
- **Sprint 3 (SaaS):** Phase H (dealer bulk) → Phase I (API keys) → Phase J (plans) → Phase F (repair cost) → Phase G (forecast) → Phase K (white‑label) → finish Phase L redesign.

---

## 5. Definition of done (every phase)

1. `npm run build` clean; `./eval/run_all.sh` green (backend changes).
2. Works in **both** light and dark; responsive to mobile; keyboard + screen‑reader accessible.
3. Free‑tier only; secrets via env, never committed.
4. Committed with a clear `feat/fix(scope)` message + Co‑Authored‑By trailer, and **pushed**; verified on the live URL where applicable.
5. `ROADMAP.md` scorecard updated as items ship.

---

*Questions on any phase: the strategy + scoring rationale is in [`ROADMAP.md`](ROADMAP.md); the system design is in [`ARCHITECTURE.md`](ARCHITECTURE.md); key decisions are in [`DECISIONS.md`](DECISIONS.md).*
