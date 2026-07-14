# Architecture Decision Log

Each entry records **what** was chosen and **why**, so the whole stack is defensible in a viva or interview. Appended to as the project progresses.

---

## ADR-001 — Render for the backend, not Railway

**Decision:** Host the FastAPI orchestration API on Render's free web service.

**Why:** As of 2026 Railway no longer offers a genuine always-free tier — it moved to a one-time $5 trial credit, after which the container stops until a card is added. Building the portfolio's "live link" on a host that will silently stop working is not production-honest. Render's free web service (512 MB RAM / 0.1 CPU, spins down after 15 min idle, ~1 min cold boot) is a real always-free tier; we account for the cold start with an explicit UI loading state.

---

## ADR-002 — CV model runs on Hugging Face Spaces, not on Render

**Decision:** The YOLOv8 damage detector is served from a Hugging Face Space (free CPU Basic: 2 vCPU / 16 GB RAM), separate from the backend API.

**Why:** A real object-detection model does not fit in Render's 512 MB free RAM. HF Spaces CPU Basic is the only free tier generous enough to actually run the detector. This also cleanly separates the deep-learning inference concern from orchestration.

---

## ADR-003 — Training on Kaggle Notebooks, offline

**Decision:** All CV and tabular model training happens on Kaggle Notebooks (30 GPU-hrs/week, P100/T4), with only the final exported weights (ONNX / joblib) committed to the repo.

**Why:** Free GPU with no card required, generous enough to fine-tune a small detector. Keeps recurring training cost at zero and keeps large intermediate artifacts out of the repo.

---

## ADR-004 — Supabase as the single data plane + scheduled keep-alive

**Decision:** Supabase provides Postgres, pgvector, Auth, and Storage in one free project. A scheduled GitHub Actions job pings it every ~3 days.

**Why:** One database serves relational data (users, valuations) and vector search (comparables) — no separate vector DB needed. Supabase free projects auto-pause after 7 days of zero API traffic; the keep-alive ping ensures the portfolio link is never dead when a recruiter opens it.

---

## ADR-005 — YOLOv8 detection, not image classification

**Decision:** Use YOLOv8-small for damage *detection/localization*, not a classification-only model.

**Why:** Damage location matters for pricing — a windshield crack costs differently than a bumper scratch. We need to know *where* and *what*, not just *whether* the car is damaged. A purpose-trained detector with a measured mAP is also more auditable than a vision-language model's free-text description, which can hallucinate or miss subtle damage.

---

## ADR-006 — XGBoost + SHAP for valuation, not a neural net

**Decision:** Classical gradient boosting (XGBoost) with SHAP explanations for the price model.

**Why:** Tabular data (make/model/year/mileage/spec) is exactly where gradient boosting wins, and SHAP gives per-prediction, directionally-checkable explanations ("higher mileage pushed the price down by AED X"). Runs in-process inside FastAPI with negligible RAM — no separate model host needed.

---

## ADR-007 — Gemini Flash primary, Groq Llama 3.3 70B fallback

**Decision:** Single swappable `llm_client` interface: Gemini Flash first, automatic fallback to Groq on rate-limit/error.

**Why:** Both have real free tiers; the fallback keeps the report agent working when one provider throttles. Wrapping both behind one interface makes swapping providers a one-line change.

---

## ADR-008 — Verifier Agent as a hard gate on report claims

**Decision:** Every number in the generated seller report must trace to a specific model output (a SHAP value, a CV detection, or a comparable listing ID); the Verifier Agent rejects/flags any sentence that doesn't.

**Why:** Citation grounding is what eliminates the majority of synthesis hallucinations in production agentic RAG. It is a hard gate, not a suggestion — this is the honesty guarantee the whole product rests on.

---

## ADR-009 — Primary valuation dataset swapped to real used-car *listings*

**Decision:** Use `alikalwar/uae-used-car-prices-and-features-10k-listings` (Kaggle, 10,000 real UAE used-car listings) as the primary training set for the valuation model and the source for the comparables index. Keep the master-prompt-named `owaiskhan9654/uae-car-used-dataset` as an optional spec-enrichment source only.

**Why:** On inspection, `owaiskhan9654/uae-car-used-dataset` is not used-car listings — it is a DriveArabia **new-car spec/price guide** (`Approx Cost` MSRP range, `Power`, `Torque`, `Fuel Econ`), with **no mileage, no per-listing sale price, and no condition**. A mileage-aware used-car valuation model — the core of this product — cannot be trained on it. The `alikalwar` dataset has exactly the fields the master prompt *described* (`Make, Model, Year, Price, Mileage, Body Type, Cylinders, Transmission, Fuel Type, Color, Location, Description`), plus a parsed **condition** signal in the description that bridges the CV damage output to a price adjustment. Both datasets are real and public — the "no synthetic data" rule is preserved; only the named source was corrected to match its own stated intent.

**Data facts (after `data/prepare_tabular.py`):** 9,995 clean rows, 65 makes, 485 models, price median AED 102,625, mileage median 154,360 km, 6 near-balanced condition classes (~1,600 each).

---

## ADR-010 — CV data is unified on Kaggle, not downloaded locally

**Decision:** The ~5.25 GB of CV images (CarDD 3 GB + VehiDE 2.25 GB) are never downloaded to the dev laptop. Annotation unification runs in `notebooks/01_cv_data_prep.ipynb` **on Kaggle**, where both datasets are already available as free attachable inputs, and training (notebook 02) consumes the combined output there.

**Why:** Downloading 5 GB locally only to re-upload to Kaggle for GPU training wastes disk and bandwidth for zero benefit. Kaggle mounts datasets read-only at `/kaggle/input/`, so the prep + train pipeline lives entirely where the data and the free GPU are. `gabrielfcarvalho/cardd-with-yolo-annotations-images-labels` is already in YOLO format; VehiDE (COCO) is converted and both are remapped to one unified 6-class damage schema, with any unmapped source class printed and halting the merge (no silent drops).

---

## ADR-011 — The "10K UAE listings" Kaggle dataset is synthetic; pivot to freshly-scraped real Dubizzle listings

**Decision:** Reject `alikalwar/uae-used-car-prices-and-features-10k-listings` (and its byte-identical mirror `mohamedsaad254/...`, same MD5) as training data. The primary valuation + comparables dataset is now a **fresh scrape of real Dubizzle UAE used-car listings** (via the Apify actor `agenscrape/dubizzle-uae-scraper`, ~1,400 listings across Dubai/Abu Dhabi/Sharjah/Ajman/RAK), with the real **Syarah Saudi used-cars dataset** (`turkibintalib/saudi-arabia-used-cars-dataset`, 8,035 scraped syarah.com listings) retained as a volume backup.

**Why:** On statistical inspection, the alikalwar dataset fails every real-market signature: price has ~zero correlation with age (−0.001), mileage (+0.010) and condition (−0.010); a third of 2023+ cars show >200,000 km; same-model-year prices vary randomly. It is generated data, and training on it would violate this project's non-negotiable "no synthetic training data" rule — the model demonstrably could not beat a naive make/model-median baseline on it. The master prompt itself sanctions refreshing listings by scraping (Section 8). Scraped Dubizzle rows are verifiably real (each row carries its live listing URL — ideal for the citation-grounded comparables layer) and carry exactly the fields the spec calls for, including `regionalSpecs` (GCC/American/etc.), mileage, price, and seller type.

**Honest trade-off:** ~1,400 rows is a small training set; expected valuation error bars are wider and are disclosed per the confidence contract. The Syarah dataset (8k rows, real, Saudi market) is kept in `data/raw/syarah/` as an optional robustness/enrichment source, clearly labelled as a different market if ever used.

---

## ADR-012 — Comparables RAG: hybrid retrieval with structured similarity dominant, local artifact + pgvector

**Decision:** "Find similar cars" combines dense (MiniLM `all-MiniLM-L6-v2`, 384-dim), sparse (BM25), and **structured** (make/model/body/year/mileage proximity) signals, with structured weighted highest (0.55), then a cross-encoder (`ms-marco-MiniLM-L-6-v2`) rerank blended 50/50 with structured similarity. The index ships as a committed 1 MB joblib artifact (`backend-api/models/comparables_index.joblib`) so the backend needs no external service locally; Supabase pgvector (schema + loader written) is the drop-in production backend serving the identical rows/embeddings.

**Why:** For *comparable cars*, domain similarity (same make/model, near year/mileage) is what "comparable" actually means — pure semantic embedding would surface superficially-similar text. Structured-dominant weighting reflects that, while dense+BM25 handle model-name variants and spec nuance. Validated on 6 hand-picked queries: **same-make precision@5 = 1.0**, exact-model matches on 5/6 (`eval/comparables_eval.json`). All comparables carry their real `listing_id` + source `url` for citation grounding. Local artifact keeps the demo alive with zero Supabase dependency; pgvector scales it when the free project is provisioned.

---

## ADR-013 — Agent graph as a LangGraph state machine with a hard Verifier gate

**Decision:** The orchestration API is a LangGraph `StateGraph`: Intake → Aggregation(CV) → Valuation → Comparables → Report → Verifier → Confidence, each node appending a trace entry streamed to the UI over SSE. The Report agent may state ONLY numbers present in a citation-tagged evidence block; the **Verifier** is a deterministic, non-LLM gate that parses every AED figure, percentage, and `[citation]` in the report and fails any that doesn't trace to a computed value.

**Why:** Citation grounding is the project's honesty guarantee — enforced as code, not a prompt suggestion. The Verifier caught its own gaps during testing (SHAP driver AED impacts and rounded coverage weren't indexed) and was fixed until a real report passed with 13 numbers / 14 citations all grounded. The LLM client (`google-genai` Gemini Flash → Groq Llama 3.3 → deterministic template) means the whole graph runs end-to-end before any API key exists, so the pipeline is always demonstrable; the template report is citation-correct by construction and passes the same Verifier.

## ADR-014 — Render 512 MB free tier cannot hold torch; production embeds via pgvector + light query encoder

**Decision (deployment plan, Phase 10):** The comparables corpus is **pre-embedded** into the committed artifact / Supabase pgvector, so the corpus never needs torch at runtime. On Render free (512 MB), the backend will embed the *query* with a lightweight ONNX MiniLM via `onnxruntime` (~90 MB) instead of `sentence-transformers`+torch (~1 GB), and delegate ANN search to Supabase pgvector's `match_comparables`. BM25 + structured rerank stay in pure Python (negligible RAM).

**Why:** The dev/demo backend uses the full `sentence-transformers` stack (accurate, simple, tested — same numbers), but it does not fit 512 MB. Rather than pretend it deploys as-is, the production path swaps only the query-embedding component to ONNX and pushes vector search to Postgres. This keeps the free-tier promise real. The swap is isolated behind `LocalStore` / `SupabaseStore` (ADR-012), so no agent code changes. **Status: query-ONNX-embedder + SupabaseStore are wired and tested in Phase 10 once the Supabase project exists.**

---

## ADR-015 — Frontend: premium dark/light Next.js with graceful demo fallback

**Decision:** Next.js 14 (App Router) + Tailwind + framer-motion + Recharts, `next-themes` dark-primary/light toggle, Inter + JetBrains Mono (tabular figures for all money/metrics). The API client streams the backend SSE (`/valuate/stream`) by POST-ing via `fetch` and parsing frames from the `ReadableStream`; if the backend is unreachable it degrades to a deterministic **demo** result with a staged trace, so the portfolio link is never dead during a Render cold start.

**Why:** Design direction "Modern Dark (Cinema Mobile)" — glassmorphism header, ambient light blobs, instrument-cluster aesthetic matching an automotive dashboard. Verified end-to-end against the live local backend: the 7-step reasoning trace streams in real time, the SHAP waterfall + animated price gauge render, comparables show real listing IDs, and the seller report's `[V*]/[C*]` citations are clickable to their evidence. Two real bugs were found and fixed during browser testing: sse-starlette uses `\r\n` frame separators (normalize before splitting), and the final `result` frame arrives without a trailing blank line (flush the buffer on stream close). Mobile verified at 375px — single column, no overflow, responsive chart.

**Free-tier note:** heavy compute stays in the backend; Vercel only proxies. `NEXT_PUBLIC_API_URL` selects the backend; unset → demo mode.

---

## Dataset licensing

| Dataset | Use | License / terms |
|---|---|---|
| Dubizzle UAE scrape (via Apify `agenscrape/dubizzle-uae-scraper`, July 2026) | **Primary**: valuation model + comparables index | Publicly visible listings, collected for research/education; each row retains its source listing URL for attribution. No personal contact data is stored. |
| `turkibintalib/saudi-arabia-used-cars-dataset` (Syarah) | Backup/robustness (different market, labelled) | Kaggle public dataset of scraped syarah.com listings. |
| ~~`alikalwar/uae-used-car-prices-and-features-10k-listings`~~ | **Rejected** — synthetic (see ADR-011) | — |
| `owaiskhan9654/uae-car-used-dataset` | Optional spec enrichment only | CC0-1.0 (public domain) per Kaggle metadata. |
| `gabrielfcarvalho/cardd-with-yolo-annotations-images-labels` (CarDD) | CV training | CarDD released for academic research (see cardd-ustc.github.io / arXiv). YOLO-annotated mirror on Kaggle. |
| `hendrichscullen/vehide-dataset-automatic-vehicle-damage-detection` (VehiDE) | CV training | Kaggle public dataset for vehicle-damage detection research. |

No synthetic or LLM-generated training data is used anywhere in this project.
