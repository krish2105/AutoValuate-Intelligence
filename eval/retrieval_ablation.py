"""
D5 — Retrieval ablation.

Question: the retriever is a weighted hybrid of dense (MiniLM), BM25 and a hand-written
structured similarity, weighted 0.30 / 0.15 / 0.55 in favour of the structured signal.
Is that structured dominance actually earning its keep, or is it just a prior we asserted?

We ablate each component by zeroing its weight and re-running the same benchmark queries,
measuring on the top-5:
  - same-make precision   (a "comparable" that isn't even the same make is not comparable)
  - exact-model hit rate  (did we surface the actual same model, when it exists)
  - price dispersion      (spread of the retrieved prices; a tight spread means the set
                           actually agrees on what the car is worth — a wildly dispersed
                           set gives the valuation nothing to stand on)

Run: USE_TF=0 python eval/retrieval_ablation.py  ->  eval/retrieval_ablation.json
"""
from __future__ import annotations

import os
os.environ.setdefault("USE_TF", "0")

import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend-api" / "agents"))
from comparables_rag_agent import ComparablesAgent  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "eval" / "retrieval_ablation.json"

QUERIES = [
    {"make": "toyota", "model": "corolla", "year": 2019, "kilometers": 90000, "bodyType": "Sedan"},
    {"make": "nissan", "model": "patrol", "year": 2020, "kilometers": 60000, "bodyType": "SUV"},
    {"make": "mercedes-benz", "model": "c-class", "year": 2018, "kilometers": 80000, "bodyType": "Sedan"},
    {"make": "ford", "model": "mustang", "year": 2017, "kilometers": 70000, "bodyType": "Coupe"},
    {"make": "lexus", "model": "lx", "year": 2019, "kilometers": 95000, "bodyType": "SUV"},
    {"make": "honda", "model": "civic", "year": 2020, "kilometers": 55000, "bodyType": "Sedan"},
]

# name -> (w_dense, w_bm25, w_struct)
VARIANTS: dict[str, tuple[float, float, float]] = {
    "hybrid (shipped)":  (0.30, 0.15, 0.55),
    "dense only":        (1.00, 0.00, 0.00),
    "BM25 only":         (0.00, 1.00, 0.00),
    "structured only":   (0.00, 0.00, 1.00),
    "no structured":     (0.65, 0.35, 0.00),
    "dense-dominant":    (0.55, 0.15, 0.30),
}


def evaluate(w: tuple[float, float, float], rerank: bool) -> dict:
    """
    NOTE (this is the point of the study): with rerank=True the final top-k is chosen by
    0.5*cross-encoder + 0.5*structured, so the hybrid weights only decide the 30-candidate
    POOL and have almost no say in the final ranking. Ablating them under reranking
    therefore measures nothing — every variant returns the same five cars. We must run
    rerank=False to see what the hybrid weights actually do.
    """
    agent = ComparablesAgent(w_dense=w[0], w_bm25=w[1], w_struct=w[2])
    makes, models, disp = [], [], []
    for q in QUERIES:
        hits = agent.find(q, k=5, rerank=rerank)
        if not hits:
            continue
        makes.append(sum(1 for h in hits if str(h["make"]).lower() == q["make"]) / len(hits))
        models.append(1 if any(str(h["model"]).lower() == q["model"] for h in hits) else 0)
        prices = [h["price_aed"] for h in hits if h.get("price_aed")]
        if len(prices) > 1:
            # coefficient of variation: spread relative to level, so it compares across cars
            disp.append(statistics.pstdev(prices) / max(statistics.mean(prices), 1))
    return {
        "same_make_precision@5": round(sum(makes) / len(makes), 3) if makes else 0.0,
        "exact_model_hit_rate": round(sum(models) / len(models), 3) if models else 0.0,
        "price_dispersion_cv": round(sum(disp) / len(disp), 3) if disp else 0.0,
    }


def main() -> int:
    report = {"queries": len(QUERIES), "with_rerank": {}, "hybrid_only": {}}

    for label, rerank in (("with_rerank", True), ("hybrid_only", False)):
        print(f"\nRetrieval ablation — {len(QUERIES)} queries, top-5 "
              f"({'reranker ON (as shipped)' if rerank else 'reranker OFF — isolates the hybrid weights'})\n")
        print(f"{'variant':<20}{'same-make P@5':>15}{'model hit':>12}{'price CV':>11}")
        print("-" * 58)
        for name, w in VARIANTS.items():
            r = evaluate(w, rerank)
            report[label][name] = r
            star = "  <- shipped" if "shipped" in name else ""
            print(f'{name:<20}{r["same_make_precision@5"]:>15.3f}{r["exact_model_hit_rate"]:>12.3f}'
                  f'{r["price_dispersion_cv"]:>11.3f}{star}')

    OUT.write_text(json.dumps(report, indent=2))
    print(f"\n-> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
