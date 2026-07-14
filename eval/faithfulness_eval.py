"""
Phase 9 — report faithfulness & relevancy evaluation.

Ragas' faithfulness metric decomposes a generated answer into atomic claims and
checks how many are supported by the retrieved context. In this system every
report claim is a *number* or a *citation*, which is machine-checkable — so we
compute faithfulness deterministically instead of via an LLM judge. That makes
the metric fully reproducible and auditable (no self-grading), which is the
stronger guarantee for a valuation product.

  faithfulness = supported numeric/percentage claims / total such claims
  citation_validity = citations resolving to real evidence / total citations
  relevancy = fraction of expected elements present (vehicle, price, comparables,
              condition disclosure)

Target (Section 15): faithfulness >= 0.90. The Verifier gate enforces it at
serve time; this script measures it across the whole benchmark.

When GEMINI_API_KEY/GROQ_API_KEY are set, reports are written by the live LLM and
this same metric grades them — otherwise the deterministic template is graded
(faithful by construction). Run: USE_TF=0 python eval/faithfulness_eval.py
"""
from __future__ import annotations
import os
os.environ.setdefault("USE_TF", "0")

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-api"))

from graph import orchestrator  # noqa: E402
from agents import verifier_agent  # noqa: E402

CASES = json.loads((ROOT / "eval" / "benchmark_cases.json").read_text())["cases"]
_CITE = re.compile(r"\[([A-Z]\d+)\]")
_AED = re.compile(r"(?:AED|aed)\s*[\d,]+|[\d,]+(?:\.\d+)?\s*(?:AED|aed)")
_PCT = re.compile(r"[\d]+(?:\.\d+)?\s*%")


def score_report(report: str, evidence: dict) -> dict:
    verdict = verifier_agent.verify(report, evidence)
    n_numbers = len(_AED.findall(report)) + len(_PCT.findall(report))
    n_number_viol = sum(1 for v in verdict["violations"] if "not grounded" in v)
    n_cites = len(_CITE.findall(report))
    n_cite_viol = sum(1 for v in verdict["violations"] if "does not exist" in v)

    faithfulness = 1.0 if n_numbers == 0 else round((n_numbers - n_number_viol) / n_numbers, 3)
    cite_validity = 1.0 if n_cites == 0 else round((n_cites - n_cite_viol) / n_cites, 3)
    return {"faithfulness": faithfulness, "citation_validity": cite_validity,
            "numbers": n_numbers, "citations": n_cites, "violations": verdict["violations"]}


def score_relevancy(report: str, case: dict, result: dict) -> float:
    r = report.lower()
    checks = [
        case["make"].lower() in r,                              # names the vehicle
        case["model"].lower() in r or str(case["year"]) in r,
        f'{int(result["valuation"]["price_mid_aed"]):,}' in report,  # states the price
        "[c1]" in r or "comparable" in r,                       # cites comparables
        "inspection" in r or "confidence" in r or "estimate" in r,   # discloses uncertainty
    ]
    return round(sum(checks) / len(checks), 3)


def main() -> None:
    live = orchestrator._LLM.has_live_provider
    print(f"Grading reports written by: {'LIVE LLM' if live else 'deterministic template'}\n")

    rows = []
    for case in CASES:
        res = orchestrator.run(case)
        f = score_report(res["report"], res["evidence"])
        rel = score_relevancy(res["report"], case, res)
        rows.append({"id": case["id"], **f, "relevancy": rel, "provider": res["report_provider"]})
        print(f"  {case['id']:9s} faithfulness={f['faithfulness']:.3f}  cite_valid={f['citation_validity']:.3f}  "
              f"relevancy={rel:.3f}  ({f['numbers']} nums, {f['citations']} cites)")

    # Negative control: a deliberately hallucinated report must score BELOW target,
    # proving the metric discriminates and isn't trivially 1.0 for everything.
    ctrl_ev = orchestrator.run(CASES[0])["evidence"]
    hallucinated = ("The car is worth AED 30,000 [V1]. Actually a dealer offered AED 888,888 "
                    "and another AED 777,777 for it. Confidence 55%. See [Z9].")
    ctrl = score_report(hallucinated, ctrl_ev)
    print(f"\n  negative-control (hallucinated) faithfulness={ctrl['faithfulness']:.3f} "
          f"cite_valid={ctrl['citation_validity']:.3f}  <- must be < 0.90")

    n = len(rows)
    summary = {
        "report_writer": "live_llm" if live else "template",
        "n_reports": n,
        "mean_faithfulness": round(sum(r["faithfulness"] for r in rows) / n, 3),
        "min_faithfulness": round(min(r["faithfulness"] for r in rows), 3),
        "mean_citation_validity": round(sum(r["citation_validity"] for r in rows) / n, 3),
        "mean_relevancy": round(sum(r["relevancy"] for r in rows) / n, 3),
        "target_faithfulness": 0.90,
        "meets_target": min(r["faithfulness"] for r in rows) >= 0.90,
        "negative_control": {"faithfulness": ctrl["faithfulness"], "citation_validity": ctrl["citation_validity"],
                             "discriminates": ctrl["faithfulness"] < 0.90},
        "per_report": rows,
    }
    if not summary["negative_control"]["discriminates"]:
        print("  WARNING: negative control did not drop below target — metric may be trivial!")
    (ROOT / "eval" / "faithfulness_report.json").write_text(json.dumps(summary, indent=2))
    print(f"\nmean faithfulness      {summary['mean_faithfulness']:.3f}  (target >= 0.90)")
    print(f"min  faithfulness      {summary['min_faithfulness']:.3f}")
    print(f"mean citation validity {summary['mean_citation_validity']:.3f}")
    print(f"mean relevancy         {summary['mean_relevancy']:.3f}")
    print(f"meets target: {summary['meets_target']}  -> eval/faithfulness_report.json")
    sys.exit(0 if summary["meets_target"] else 1)


if __name__ == "__main__":
    main()
