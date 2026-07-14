"""
Phase 8 — end-to-end integration test.

Runs every fixed benchmark vehicle through the FULL orchestration graph
(Intake → Aggregation → Valuation → Comparables → Report → Verifier → Confidence)
and asserts each stage produced correct, self-consistent output. This is the
integration gate: if any hard check fails on any case, the suite exits non-zero.

Run: USE_TF=0 python eval/e2e_test.py
Writes: eval/e2e_report.json
"""
from __future__ import annotations
import os
os.environ.setdefault("USE_TF", "0")

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-api"))

from graph import orchestrator  # noqa: E402

CASES = json.loads((ROOT / "eval" / "benchmark_cases.json").read_text())["cases"]
EXPECT_STEPS = ["intake", "aggregation", "valuation", "comparables", "report", "verifier", "confidence"]


def check_case(case: dict) -> dict:
    fails: list[str] = []
    res = orchestrator.run(case)

    if not res.get("ok"):
        return {"id": case["id"], "passed": False, "fails": [f"pipeline error: {res.get('error')}"]}

    # --- trace completeness ---
    steps = [t["step"] for t in res["trace"]]
    if steps != EXPECT_STEPS:
        fails.append(f"trace steps {steps} != expected {EXPECT_STEPS}")
    for t in res["trace"]:
        if t["status"] == "error":
            fails.append(f"stage {t['step']} errored")

    # --- valuation ordering + sanity ---
    v = res["valuation"]
    lo, mid, hi = v["price_low_aed"], v["price_mid_aed"], v["price_high_aed"]
    if not (0 < lo <= mid <= hi):
        fails.append(f"price ordering invalid: {lo}/{mid}/{hi}")
    if not (0.6 <= v["interval_coverage"] <= 0.95):
        fails.append(f"interval_coverage {v['interval_coverage']} out of expected band")
    if not v["explanation"]["top_factors"]:
        fails.append("no SHAP factors returned")

    # --- comparables ---
    comps = res["comparables"]
    if len(comps) != 5:
        fails.append(f"expected 5 comparables, got {len(comps)}")
    for c in comps:
        if not c.get("listing_id") or not c.get("url") or c.get("price_aed") in (None, ""):
            fails.append(f"comparable missing id/url/price: {c.get('listing_id')}")
            break
    if case.get("expect_same_make") and comps:
        if str(comps[0]["make"]).lower() != case["make"].lower():
            fails.append(f"top comparable make {comps[0]['make']} != {case['make']}")

    # --- report + citations ---
    report = res["report"]
    if len(report) < 200:
        fails.append("report too short")
    n_cites = report.count("[V") + report.count("[C") + report.count("[P") + report.count("[D")
    if n_cites < 3:
        fails.append(f"report has too few citations ({n_cites})")

    # --- verifier hard gate ---
    if not res["verification"]["passed"]:
        fails.append(f"verifier failed: {res['verification']['violations']}")

    # --- confidence disclosure ---
    conf = res["confidence"]
    if conf["level"] not in ("high", "medium", "low"):
        fails.append(f"bad confidence level: {conf['level']}")
    if not conf["statement"].strip():
        fails.append("empty confidence statement")

    return {
        "id": case["id"], "passed": not fails, "fails": fails,
        "mid_aed": mid, "range_aed": [lo, hi],
        "top_comp": f'{comps[0]["year"]} {comps[0]["make"]} {comps[0]["model"]}' if comps else None,
        "top_sim": comps[0]["similarity"] if comps else None,
        "verified": res["verification"]["passed"],
        "confidence": conf["level"],
        "report_provider": res["report_provider"],
    }


def main() -> None:
    print(f"Running {len(CASES)} benchmark cases end-to-end...\n")
    t0 = time.time()
    results = []
    for case in CASES:
        r = check_case(case)
        results.append(r)
        mark = "PASS" if r["passed"] else "FAIL"
        extra = "" if r["passed"] else f"  <- {r['fails']}"
        mid = r.get("mid_aed")
        print(f"  [{mark}] {r['id']:9s} {('AED '+format(int(mid),',')) if mid else '':>14s}"
              f"  comp: {r.get('top_comp','—')}{extra}")

    passed = sum(1 for r in results if r["passed"])
    elapsed = round(time.time() - t0, 1)
    summary = {
        "total": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "pass_rate": round(passed / len(results), 3),
        "elapsed_sec": elapsed,
        "avg_sec_per_case": round(elapsed / len(results), 2),
        "cases": results,
    }
    (ROOT / "eval" / "e2e_report.json").write_text(json.dumps(summary, indent=2))
    print(f"\n{passed}/{len(results)} passed in {elapsed}s -> eval/e2e_report.json")
    if passed != len(results):
        sys.exit(1)


if __name__ == "__main__":
    main()
