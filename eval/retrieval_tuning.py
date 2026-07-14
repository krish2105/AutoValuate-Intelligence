"""
D5 follow-up — act on the ablation instead of defending the design.

The ablation (docs/RESEARCH.md) found three things:
  1. same-make P@5 is SATURATED — nearly every configuration scores 1.000, so the old
     benchmark cannot discriminate between retrievers and must not be cited as evidence.
  2. structured similarity ALONE produced tighter comparable sets than the tuned hybrid.
  3. with the reranker on, the hybrid weights barely reach the final ranking at all.

So here we (a) build a HARDER benchmark — rare models, cross-body queries, and vehicles
with few true comparables, where a lazy retriever is punished — and (b) sweep the weights
on it rather than asserting 0.30/0.15/0.55.

Primary metric is **price dispersion** (coefficient of variation of the retrieved prices).
For a valuation product this is the metric that matters: a comparable set that disagrees
wildly about price gives the estimate nothing to stand on. same-make precision is reported
as a guard-rail — a retriever that wins on dispersion by returning the wrong make is
cheating, so any variant that drops below 0.9 is disqualified.

Run: USE_TF=0 python eval/retrieval_tuning.py  ->  eval/retrieval_tuning.json
"""
from __future__ import annotations

import os
os.environ.setdefault("USE_TF", "0")

import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend-api" / "agents"))
from comparables_rag_agent import ComparablesAgent, LocalStore  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "eval" / "retrieval_tuning.json"

MIN_MAKE_PRECISION = 0.90  # guard-rail: below this the variant is disqualified

# HARD benchmark: the old one used six popular sedans/SUVs that any retriever nails.
# These deliberately include rare models, unusual bodies, very high/low mileage, and
# vehicles the corpus is thin on — the cases where a retriever actually has to choose.
QUERIES = [
    # popular (kept, as a floor)
    {"make": "toyota", "model": "corolla", "year": 2019, "kilometers": 90000, "bodyType": "Sedan"},
    {"make": "nissan", "model": "patrol", "year": 2020, "kilometers": 60000, "bodyType": "SUV"},
    # rare / thin-corpus
    {"make": "porsche", "model": "911", "year": 2019, "kilometers": 40000, "bodyType": "Coupe"},
    {"make": "jeep", "model": "wrangler", "year": 2018, "kilometers": 85000, "bodyType": "SUV"},
    {"make": "mini", "model": "cooper", "year": 2020, "kilometers": 35000, "bodyType": "Hatchback"},
    # unusual body for the make
    {"make": "mercedes-benz", "model": "g-class", "year": 2021, "kilometers": 25000, "bodyType": "SUV"},
    {"make": "ford", "model": "f-150", "year": 2019, "kilometers": 110000, "bodyType": "Pick Up Truck"},
    # extreme mileage — mileage must dominate, not the badge
    {"make": "toyota", "model": "land cruiser", "year": 2015, "kilometers": 280000, "bodyType": "SUV"},
    {"make": "honda", "model": "civic", "year": 2023, "kilometers": 8000, "bodyType": "Sedan"},
    # luxury vs mass-market at the same age (price must not collapse to the mean)
    {"make": "bmw", "model": "7-series", "year": 2019, "kilometers": 70000, "bodyType": "Sedan"},
]

# (w_dense, w_bm25, w_struct)
GRID: dict[str, tuple[float, float, float]] = {
    "current (0.30/0.15/0.55)": (0.30, 0.15, 0.55),
    "structured-heavy (0.15/0.05/0.80)": (0.15, 0.05, 0.80),
    "structured-only (0/0/1)": (0.00, 0.00, 1.00),
    "structured-dominant (0.20/0.10/0.70)": (0.20, 0.10, 0.70),
    "balanced (0.40/0.20/0.40)": (0.40, 0.20, 0.40),
    "dense-heavy (0.70/0.10/0.20)": (0.70, 0.10, 0.20),
}


def evaluate(store: LocalStore, w: tuple[float, float, float], rerank: bool) -> dict:
    agent = ComparablesAgent(store=store, w_dense=w[0], w_bm25=w[1], w_struct=w[2])
    makes, disp, hits = [], [], []
    for q in QUERIES:
        got = agent.find(q, k=5, rerank=rerank)
        if not got:
            continue
        makes.append(sum(1 for h in got if str(h["make"]).lower() == q["make"]) / len(got))
        hits.append(1 if any(str(h["model"]).lower() == q["model"] for h in got) else 0)
        prices = [h["price_aed"] for h in got if h.get("price_aed")]
        if len(prices) > 1:
            disp.append(statistics.pstdev(prices) / max(statistics.mean(prices), 1))
    return {
        "same_make_precision@5": round(sum(makes) / len(makes), 3) if makes else 0.0,
        "exact_model_hit_rate": round(sum(hits) / len(hits), 3) if hits else 0.0,
        "price_dispersion_cv": round(sum(disp) / len(disp), 4) if disp else 0.0,
    }


def main() -> int:
    store = LocalStore()  # load the index once; every variant re-scores the same records
    report: dict = {"queries": len(QUERIES), "benchmark": "hard", "results": {}}

    for rerank in (False, True):
        label = "with_rerank" if rerank else "hybrid_only"
        report["results"][label] = {}
        print(f"\nHARD benchmark — {len(QUERIES)} queries, top-5 "
              f"({'reranker ON' if rerank else 'reranker OFF'})\n")
        print(f"{'weights':<38}{'make P@5':>10}{'model hit':>11}{'price CV':>11}")
        print("-" * 70)
        for name, w in GRID.items():
            r = evaluate(store, w, rerank)
            report["results"][label][name] = r
            ok = r["same_make_precision@5"] >= MIN_MAKE_PRECISION
            flag = "" if ok else "  DISQUALIFIED (wrong make)"
            print(f'{name:<38}{r["same_make_precision@5"]:>10.3f}{r["exact_model_hit_rate"]:>11.3f}'
                  f'{r["price_dispersion_cv"]:>11.4f}{flag}')

    # pick the winner on the metric that matters, among variants that keep the make
    pool = {n: r for n, r in report["results"]["hybrid_only"].items()
            if r["same_make_precision@5"] >= MIN_MAKE_PRECISION}
    best = min(pool.items(), key=lambda kv: kv[1]["price_dispersion_cv"]) if pool else None
    if best:
        report["winner"] = {"weights": best[0], **best[1]}
        print(f"\nBEST (tightest comparable set, make preserved): {best[0]}")
        print(f"   price dispersion {best[1]['price_dispersion_cv']:.4f} · "
              f"make P@5 {best[1]['same_make_precision@5']:.3f}")

    OUT.write_text(json.dumps(report, indent=2))
    print(f"\n-> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
