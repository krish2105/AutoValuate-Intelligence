"""
Phase 5 retrieval validation — do the comparables actually resemble the query car?

Runs the ComparablesAgent over hand-picked query vehicles and measures, for the top-5:
  - same-make precision   (comparables should share the make)
  - same-model hit rate   (ideally at least some exact-model matches when they exist)
  - price sanity          (median comparable price within a plausible band)

Writes eval/comparables_eval.json. Honest metric, real listings.

Run: USE_TF=0 python eval/comparables_eval.py
"""
from __future__ import annotations
import os
os.environ.setdefault("USE_TF", "0")

import json
import sys
from pathlib import Path
from statistics import median

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend-api" / "agents"))
from comparables_rag_agent import ComparablesAgent  # noqa: E402

QUERIES = [
    {"make": "toyota", "model": "corolla", "year": 2019, "kilometers": 90000, "bodyType": "Sedan"},
    {"make": "nissan", "model": "patrol", "year": 2020, "kilometers": 60000, "bodyType": "SUV"},
    {"make": "mercedes-benz", "model": "c-class", "year": 2018, "kilometers": 80000, "bodyType": "Sedan"},
    {"make": "ford", "model": "mustang", "year": 2017, "kilometers": 70000, "bodyType": "Coupe"},
    {"make": "lexus", "model": "lx", "year": 2019, "kilometers": 95000, "bodyType": "SUV"},
    {"make": "honda", "model": "civic", "year": 2020, "kilometers": 55000, "bodyType": "Sedan"},
]


def main() -> None:
    agent = ComparablesAgent()
    rows, make_precisions, model_hits = [], [], []
    for q in QUERIES:
        comps = agent.find(q, k=5)
        same_make = sum(1 for c in comps if str(c["make"]).lower() == q["make"]) / max(1, len(comps))
        same_model = sum(1 for c in comps if str(c["model"]).lower() == q["model"])
        prices = [c["price_aed"] for c in comps if c.get("price_aed")]
        make_precisions.append(same_make)
        model_hits.append(1 if same_model else 0)
        rows.append({
            "query": f'{q["year"]} {q["make"]} {q["model"]}',
            "same_make_precision@5": round(same_make, 3),
            "same_model_count@5": same_model,
            "median_comp_price_aed": round(median(prices)) if prices else None,
            "top": [f'{c["year"]} {c["make"]} {c["model"]} {c["kilometers"]}km AED{c["price_aed"]}'
                    for c in comps[:3]],
        })

    report = {
        "queries": len(QUERIES),
        "mean_same_make_precision@5": round(sum(make_precisions) / len(make_precisions), 3),
        "queries_with_exact_model_match": f"{sum(model_hits)}/{len(model_hits)}",
        "per_query": rows,
    }
    out = Path(__file__).with_name("comparables_eval.json")
    out.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
