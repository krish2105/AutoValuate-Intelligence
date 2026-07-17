"""
Scoring check: a large-area collision must NOT score as "minor cosmetic", and the browser and
backend scorers must agree. Runs the shared fixtures (eval/cv_scoring_fixtures.json) through:
  - the backend scorer  (aggregation_agent.aggregate, with cv_local.detect monkeypatched to
    return the fixture's detections — no model needed), and
  - the browser scorer  (frontend/scripts/cv-scoring-run.mjs -> conditionFromDetections),
then asserts each case lands in its expected band and the two scores agree within tolerance.

This is the regression guard for the "Mustang wreck scored 82/100 Good" bug. Run:
    python eval/cv_scoring.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-api"))

from agents import aggregation_agent, cv_local  # noqa: E402

FIX = json.loads((ROOT / "eval" / "cv_scoring_fixtures.json").read_text())
CASES, BANDS = FIX["cases"], FIX["bands"]
SCORE_TOL = 3  # browser vs backend may differ by a couple points (rounding); bands are the real gate

passed = failed = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global passed, failed
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))
    passed += ok
    failed += not ok


def backend_score(dets: list[dict]) -> dict:
    """Score one synthetic photo through the real aggregate(), model stubbed out."""
    _orig_avail, _orig_detect = cv_local.available, cv_local.detect
    cv_local.available = lambda: True
    cv_local.detect = lambda _photo: [dict(d) for d in dets]
    try:
        return aggregation_agent.aggregate({"photos": ["_stub_"]})
    finally:
        cv_local.available, cv_local.detect = _orig_avail, _orig_detect


# Browser scores (one esbuild build for all cases).
js_raw = subprocess.run(
    ["node", "scripts/cv-scoring-run.mjs", str(ROOT / "eval" / "cv_scoring_fixtures.json")],
    cwd=ROOT / "frontend", capture_output=True, text=True, check=True,
).stdout
JS = json.loads(js_raw)

print("scoring check (backend vs browser, and expected bands):")
for name, dets in CASES.items():
    be = backend_score(dets)
    bscore = be["condition_score"] if be["condition_score"] is not None else 100
    jscore = JS[name]["score"]
    lo, hi = BANDS[name]
    check(f"{name}: backend score {bscore} within band [{lo},{hi}]", lo <= bscore <= hi,
          f"got {bscore}")
    check(f"{name}: browser score {jscore} within band [{lo},{hi}]", lo <= jscore <= hi,
          f"got {jscore}")
    check(f"{name}: browser≈backend (|{jscore}-{bscore}|≤{SCORE_TOL})", abs(jscore - bscore) <= SCORE_TOL,
          f"browser {jscore} vs backend {bscore}")

# The headline regression: the side collision must read as major damage, not "Good/minor".
sc = backend_score(CASES["side_collision"])
check("side_collision is NOT labelled Good/Excellent (the original bug)",
      sc["condition_score"] < 60, f"score {sc['condition_score']} band {sc.get('assessment','')}")
check("side_collision worst finding reads 'severe' (honest)",
      any(f["severity"] == "severe" for f in sc["findings"]))
check("side_collision flags needs_inspection", bool(sc.get("needs_inspection")))

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
