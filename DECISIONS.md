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

## Dataset licensing

| Dataset | Use | License / terms |
|---|---|---|
| `alikalwar/uae-used-car-prices-and-features-10k-listings` | Valuation model + comparables | Kaggle public dataset; used for research/education. Attributed in README. |
| `owaiskhan9654/uae-car-used-dataset` | Optional spec enrichment | CC0-1.0 (public domain) per Kaggle metadata. |
| `gabrielfcarvalho/cardd-with-yolo-annotations-images-labels` (CarDD) | CV training | CarDD released for academic research (see cardd-ustc.github.io / arXiv). YOLO-annotated mirror on Kaggle. |
| `hendrichscullen/vehide-dataset-automatic-vehicle-damage-detection` (VehiDE) | CV training | Kaggle public dataset for vehicle-damage detection research. |

No synthetic or LLM-generated training data is used anywhere in this project.
