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

_Licensing notes for each dataset are added in Phase 1._
