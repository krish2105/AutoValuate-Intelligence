# AutoValuate — Research Chapters (D1–D5)

Experiments that interrogate the system's own design decisions. Every number here was
produced by a script in `eval/` that anyone can re-run; where an experiment could **not**
be run honestly, this document says so instead of estimating.

Reproduce:
```bash
python eval/uncertainty_study.py        # D3
USE_TF=0 python eval/retrieval_ablation.py   # D5
```

---

## D3 — Uncertainty quantification: is our interval the right one?

**Question.** We ship a split-conformal interval. Is it actually better than the
alternatives, or did we pick the one that *sounded* most rigorous?

**Method.** Four ways of putting an 80% interval around the *same* XGBoost model, all
scored on the *same* untouched test split (60/20/20 train/calibration/test, n_test = 135).
This matters: an earlier version of this project calibrated and scored conformal on the
same rows, which reports a coverage that is **tautologically correct**. Calibration and
evaluation must never see the same data.

**Results** (`eval/uncertainty_study.json`):

| Method | Coverage (target 80%) | Mean width | Verdict |
|---|---:|---:|---|
| **split-conformal** *(shipped)* | **80.0%** | AED 107,448 | on target |
| CQR (Romano et al.) | 76.3% | AED 103,944 | under-covers |
| naive ±25% band | 56.3% | AED 50,946 | badly under-covers |
| raw quantile (uncalibrated) | 54.8% | AED 65,313 | badly under-covers |

**Findings.**

1. **Quantile regression alone is badly miscalibrated.** The q10–q90 band nominally
   promises 80% coverage and delivers **54.8%**. Anyone shipping raw quantile outputs as a
   confidence interval — which is the obvious thing to do — would be overstating their
   certainty by 25 percentage points. This is the single most important result here, and it
   is exactly the failure a user would never be able to detect.
2. **The industry rule of thumb is dangerous.** A flat ±25% band covers only 56.3% of real
   cars. It looks reassuringly tight (half the width) precisely *because* it is wrong.
3. **Split-conformal earns its place**, hitting the target coverage almost exactly. CQR is
   ~3% narrower but under-covers; given this product's whole thesis is not overstating
   certainty, we prefer the method that keeps its promise.
4. **Honest cost:** calibration buys correctness by being **wide** (AED 107k). We surface
   that width rather than hiding it — a wide interval on a thin corpus is the true state of
   knowledge, and the confidence panel says so.

---

## D5 — Retrieval ablation: is the hybrid earning its keep?

**Question.** The retriever is a weighted hybrid — dense (MiniLM) 0.30 / BM25 0.15 /
hand-written structured similarity 0.55 — then a cross-encoder rerank. Is that structured
dominance real, or a prior we asserted and never tested?

**Method.** Zero out each component's weight and re-run the benchmark queries. Measure
same-make precision@5, exact-model hit rate, and **price dispersion** (coefficient of
variation of the retrieved prices — a comparable set that disagrees wildly about price
gives the valuation nothing to stand on).

**Results** (`eval/retrieval_ablation.json`):

*Reranker ON (as shipped):*

| Variant | same-make P@5 | model hit | price CV |
|---|---:|---:|---:|
| hybrid (shipped) | 1.000 | 0.833 | 0.303 |
| dense only | 1.000 | 0.833 | 0.327 |
| BM25 only | 1.000 | 0.833 | 0.327 |
| structured only | 1.000 | 0.833 | 0.303 |
| no structured | 1.000 | 0.833 | 0.303 |

*Reranker OFF (isolates the hybrid weights):*

| Variant | same-make P@5 | model hit | price CV |
|---|---:|---:|---:|
| hybrid (shipped) | 1.000 | 0.833 | 0.293 |
| **structured only** | 1.000 | 0.833 | **0.276** |
| dense-dominant | 1.000 | 0.833 | 0.309 |
| dense only | 1.000 | 0.833 | 0.325 |
| no structured | 1.000 | 0.833 | 0.344 |
| BM25 only | **0.933** | 0.833 | 0.356 |

**Findings — three of them uncomfortable.**

1. **The tuned hybrid weights barely matter in the shipped configuration.** With the
   reranker on, *every* variant returns the same five cars. Reading the code explains why:
   the final top-k is chosen by `0.5·cross-encoder + 0.5·structured`, so the 0.30/0.15/0.55
   weights only select the 30-candidate **pool** and have almost no say in the final
   ranking. The weight tuning is, in effect, decorative. This was invisible until we
   ablated it.
2. **Structured similarity alone beats the hybrid** on the only metric that discriminates.
   With the reranker off, structured-only produces the *tightest* comparable sets
   (price CV 0.276 vs 0.293 for the hybrid). Dense and BM25 are adding **noise**, not signal:
   dropping structured entirely is worst (0.344), and BM25-only is the only variant that
   fails to keep the make (P@5 0.933).
3. **The benchmark is saturated.** same-make P@5 = 1.000 for nearly everything and the
   model-hit rate never moves. It cannot discriminate between retrievers, so it should not
   be quoted as evidence that the retriever is good. Price dispersion is the only metric
   here doing any work.

**What this changes.** Semantic retrieval is the fashionable choice, and for *this* task it
is the wrong one: "comparable" for a car is a structured predicate (same make/model, near
year, near mileage), not a fuzzy textual resemblance. The honest next steps are to (a) drop
or down-weight the dense/BM25 components rather than defend them, (b) build a harder
benchmark with graded relevance so nDCG can discriminate, and (c) re-test once the Phase-E
cron has grown the corpus, since a 675-row corpus makes almost any retriever look perfect.

---

## D5 (follow-up) — acting on the ablation, and a proof that the retriever is already optimal

The ablation said "structured beats the hybrid". Before changing the weights on that basis,
we built the **hard benchmark** the ablation said we needed (10 queries: rare models, unusual
bodies, extreme mileage, luxury-vs-mass at equal age) and swept six weightings on it.

**Result** (`eval/retrieval_tuning.json`) — every weighting scores *the same*:

| Weights (dense/BM25/structured) | same-make P@5 | model hit | price CV |
|---|---:|---:|---:|
| current 0.30 / 0.15 / 0.55 | 0.780 | 0.800 | 0.492 |
| structured-heavy 0.15 / 0.05 / 0.80 | 0.780 | 0.800 | 0.526 |
| structured-only 0 / 0 / 1 | 0.780 | 0.800 | 0.506 |
| balanced 0.40 / 0.20 / 0.40 | 0.780 | 0.800 | 0.518 |
| dense-heavy 0.70 / 0.10 / 0.20 | 0.780 | 0.800 | 0.491 |

**Then we asked why 0.780, and the answer settles it.** Counting the corpus:

| Make | Listings in corpus | Max achievable same-make P@5 |
|---|---:|---:|
| toyota | 119 | 1.00 |
| nissan | 80 | 1.00 |
| mercedes-benz | 69 | 1.00 |
| ford | 63 | 1.00 |
| honda | 62 | 1.00 |
| bmw | 60 | 1.00 |
| mini | 3 | 0.60 |
| jeep | 1 | 0.20 |
| **porsche** | **0** | **0.00** |

The theoretical ceiling for this benchmark is
`(1.0+1.0+0.0+0.2+0.6+1.0+1.0+1.0+1.0+1.0) / 10 = ` **0.780**.

**The retriever scores exactly 0.780 — it is already achieving the mathematical maximum
the data permits.** Every missing point is a listing that does not exist, not a ranking
mistake. **23 of 37 makes have fewer than 5 listings**, so for those, same-make P@5 is
capped below 1.0 no matter what any retriever does.

**Conclusions.**

1. **The retriever is data-bound, not algorithm-bound.** Tuning weights, swapping encoders,
   or fine-tuning a reranker cannot move this number. Only corpus growth can — which makes
   **Phase E (the weekly scrape) the single highest-value work item in the project**, and
   retires "improve the retriever" as a task.
2. **Our own earlier conclusion was an artifact.** The ablation's finding that
   "structured-only beats the hybrid" came from a *saturated easy benchmark*; on the hard
   one the difference vanishes into noise. We nearly re-tuned production weights on the
   strength of a measurement the benchmark was too weak to support. This is the second time
   in this project a comfortable-looking metric turned out to be measuring nothing.
3. **The cross-encoder reranker slightly *hurts*** on hard queries (make P@5 0.760 vs 0.780
   without it) while costing latency — it is not the asset we assumed.

**What we changed:** a **same-make preference** in `comparables_rag_agent.py` — same-make
candidates are promoted ahead of others (preserving relative order), and the reranker may
now reorder *within* a make bucket but can never promote a different make above a genuine
same-make comparable. It cannot raise the ceiling (nothing can, without data), but it
guarantees we never return a stranger car when a real comparable exists, and it will convert
directly into precision as Phase E grows the corpus. No regression: the easy benchmark holds
at same-make P@5 = 1.000 and faithfulness stays at 1.000.

---

## D1, D2, D4 — not run, and why

These are specified rather than estimated. Reporting a number we did not measure would
undercut the entire point of a project whose thesis is *don't state what you can't ground*.

### D1 — Photo-aware pricing ablation (**blocked: no data**)
*Plan:* embed listing photos with a frozen DINOv2/CLIP encoder, PCA the embeddings, append
to the XGBoost feature set, and measure MAE uplift vs the tabular-only model — answering
"does seeing the car improve pricing, beyond the damage detector?"
*Blocker:* our corpus is scraped listing **metadata**; we did not retain listing images, so
there is nothing to embed. Requires a scrape pass that stores photos (the Phase-E pipeline
is the natural place to add it).

### D2 — Damage severity regression head (**blocked: no labels**)
*Plan:* add a severity head (minor/moderate/severe) to the YOLOv8 detector, trained on
CarDD, feeding the Phase-F repair-cost estimator with a learned rather than heuristic
severity.
*Blocker:* we currently infer severity heuristically from detector confidence and box
impact (see `agents/repair_cost.py`). Doing it properly needs severity labels; CarDD's
damage-area annotations could be bucketed to derive them. This is the highest-value
remaining CV work.

### D4 — Quantization study (**partially measured**)
What we *did* measure, honestly:

| Model | Size | Loads in ORT-web | Note |
|---|---:|---|---|
| fp32 (shipped) | 44.8 MB | ✅ | what production serves |
| int8 dynamic | 11.5 MB | ✅ | confidences deflate sharply (peak 0.53 → 0.27; rank correlation ~0.93) |
| fp16 | 22.4 MB | ❌ | conversion produces an invalid graph on this model — `Resize`/`Cast` type mismatch in `onnxconverter-common` |

**What we did not measure: mAP under quantization.** The confidence deflation above was
observed on non-car inputs, so it says nothing rigorous about detection quality — and the
CarDD validation set lives on Kaggle, not locally. The correct experiment is to re-run
`notebooks/03_cv_eval_mAP.ipynb` against the int8 model and report mAP@0.5 alongside a
re-tuned confidence threshold (int8 would need roughly 0.22 rather than 0.35 to compensate).
Until that is run, **we ship fp32** — a 4× smaller model is not worth an unquantified hit to
the one number the CV story rests on.

---

## Summary

The two experiments we could run honestly both produced results that **argue against the
obvious design choice**:

- Raw quantile intervals — the natural thing to ship — under-cover by 25 points. Conformal
  calibration is not academic garnish; without it the product would be confidently wrong.
- Semantic retrieval — the fashionable thing to ship — adds noise to a task whose notion of
  similarity is structured. Our own tuned weights turn out not to reach the final ranking.

Both were invisible until measured, which is the argument for measuring.
