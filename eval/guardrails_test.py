"""
Phase 9 — confidence-disclosure contract (Section 15) as an enforced test.

Section 15 requires every report to state:
  (a) the CV model's detection confidence per flagged damage area (or, honestly,
      that no visual assessment was performed);
  (b) the valuation model's prediction-interval width;
  (c) a plain-English disclaimer recommending professional inspection whenever
      confidence falls below threshold.

This runs the benchmark and asserts the contract holds for every case. It also
checks the guardrail *acts*: low-confidence cases must recommend inspection, and
the report/confidence must never present a false-certain number.

Run: USE_TF=0 python eval/guardrails_test.py
"""
from __future__ import annotations
import os
os.environ.setdefault("USE_TF", "0")

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-api"))

from graph import orchestrator  # noqa: E402

CASES = json.loads((ROOT / "eval" / "benchmark_cases.json").read_text())["cases"]
passed = failed = 0
rows = []


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print(f"  [FAIL] {name} {detail}")


for case in CASES:
    res = orchestrator.run(case)
    conf = res["confidence"]
    report = res["report"].lower()
    cond = res["condition"]

    # (b) interval width must be stated (numeric) in the confidence object
    check(f"{case['id']}: interval width present", isinstance(conf["valuation_interval_pct"], (int, float)) and conf["valuation_interval_pct"] > 0)

    # (a) CV confidence surfaced when available, else honest 'not performed' note
    if cond["cv_available"]:
        check(f"{case['id']}: per-damage confidence present",
              all("max_confidence" in f for f in cond["findings"]))
    else:
        check(f"{case['id']}: honest no-CV disclosure",
              "cv_assessed" in conf and conf["cv_assessed"] is False and
              ("inspection" in report or "market-typical" in report or "not available" in report))

    # (c) low/medium confidence must recommend professional inspection
    if conf["level"] in ("low", "medium"):
        check(f"{case['id']}: recommends inspection when uncertain",
              conf["recommend_professional_inspection"] is True and "inspection" in conf["statement"].lower())

    # disclaimer: never claim to be a certified appraisal
    check(f"{case['id']}: states it is not a certified appraisal",
          "not a certified appraisal" in conf["statement"].lower())

    # confidence level must be one of the defined tiers
    check(f"{case['id']}: valid confidence tier", conf["level"] in ("high", "medium", "low"))

    rows.append({"id": case["id"], "level": conf["level"], "interval_pct": conf["valuation_interval_pct"],
                 "cv_assessed": conf["cv_assessed"], "recommends_inspection": conf["recommend_professional_inspection"]})

summary = {
    "contract": "Section 15 confidence-disclosure",
    "cases": len(CASES),
    "checks_passed": passed,
    "checks_failed": failed,
    "level_distribution": {lvl: sum(1 for r in rows if r["level"] == lvl) for lvl in ("high", "medium", "low")},
    "all_recommend_inspection_when_uncertain": all(r["recommends_inspection"] for r in rows if r["level"] in ("low", "medium")),
    "per_case": rows,
}
(ROOT / "eval" / "guardrails_report.json").write_text(json.dumps(summary, indent=2))
print(f"Confidence-disclosure contract: {passed} checks passed, {failed} failed across {len(CASES)} cases")
print(f"level distribution: {summary['level_distribution']}")
print("-> eval/guardrails_report.json")
sys.exit(1 if failed else 0)
