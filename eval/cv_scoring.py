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

# ---- multi-photo aggregation --------------------------------------------------------------
# The guided walk-around asks for 8 angles, so "many photos of one car" is the DESIGNED flow.
# Charging every photo in full made one dent shot 8 times cost 40 points; taking the plain
# maximum instead would let a wreck hide by being shot in close-ups. Both directions are pinned
# here so the hedge (REPEAT_DISCOUNT) can never be silently retuned into either failure.
MULTI = FIX.get("multi_photo_cases", {})
MBANDS = FIX.get("multi_photo_bands", {})


def backend_score_multi(photos: list[list[dict]]) -> dict:
    """Score a multi-photo scan through the real aggregate(), one stubbed detect() per photo."""
    _orig_avail, _orig_detect = cv_local.available, cv_local.detect
    state = {"i": 0}

    def _detect(_photo):
        i = state["i"]; state["i"] += 1
        return [dict(d) for d in photos[i]]

    cv_local.available = lambda: True
    cv_local.detect = _detect
    try:
        return aggregation_agent.aggregate({"photos": ["_stub_"] * len(photos)})
    finally:
        cv_local.available, cv_local.detect = _orig_avail, _orig_detect


if MULTI:
    print("\nmulti-photo aggregation (redundant angles vs genuinely more damage):")
    for name, photos in MULTI.items():
        be = backend_score_multi(photos)
        bscore = be["condition_score"] if be["condition_score"] is not None else 100
        jscore = JS[name]["score"]
        lo, hi = MBANDS[name]
        check(f"{name}: backend {bscore} in band [{lo},{hi}]", lo <= bscore <= hi, f"got {bscore}")
        check(f"{name}: browser {jscore} in band [{lo},{hi}]", lo <= jscore <= hi, f"got {jscore}")
        check(f"{name}: browser≈backend", abs(jscore - bscore) <= SCORE_TOL,
              f"browser {jscore} vs backend {bscore}")

    # The headline invariants, stated as assertions rather than left to the bands.
    one = backend_score_multi(MULTI["single_photo_dent"])["condition_score"]
    eight = backend_score_multi(MULTI["same_dent_8_angles"])["condition_score"]
    check("photographing ONE dent from 8 angles costs <15 points vs one photo "
          "(it cost 40 before — the walk-around asks for 8 angles)",
          one - eight < 15, f"one={one} eight={eight} delta={one - eight}")
    wide = backend_score_multi(MULTI["wreck_one_wide"])["condition_score"]
    split = backend_score_multi(MULTI["wreck_3_closeups"])["condition_score"]
    check("a wreck scores the same shot wide or as 3 close-ups (it cannot hide by being split)",
          abs(wide - split) <= 6, f"wide={wide} split={split}")
    fp = backend_score_multi(MULTI["false_positive_x6"])["condition_score"]
    check("a false positive repeating in 6 photos does not condemn a clean car", fp >= 90,
          f"got {fp}")
    # instances must describe the CAR, not the photo shoot.
    inst = backend_score_multi(MULTI["same_dent_8_angles"])["findings"][0]["instances"]
    check("one dent seen in 8 photos reports 1 instance, not 8", inst == 1, f"got {inst}")

# Regression 1: the side collision must read as major damage, not "Good/minor".
sc = backend_score(CASES["side_collision"])
check("side_collision is NOT labelled Good/Excellent (the original bug)",
      sc["condition_score"] < 60, f"score {sc['condition_score']} band {sc.get('assessment','')}")
check("side_collision worst finding reads 'severe' (honest)",
      any(f["severity"] == "severe" for f in sc["findings"]))
check("side_collision flags needs_inspection", bool(sc.get("needs_inspection")))

# Regression 2: a detected moderate crack must NOT read "Excellent — minimal visible damage".
cr = backend_score(CASES["single_moderate_crack"])
check("single crack is NOT called 'Excellent' (a found crack ≠ minimal damage)",
      "Excellent" not in cr["assessment"], f"band {cr['assessment']} score {cr['condition_score']}")
check("single crack floors the score (≤ 88, not 90+)", cr["condition_score"] <= 88,
      f"score {cr['condition_score']}")
check("single crack flags needs_inspection (can hide impact damage)", bool(cr.get("needs_inspection")))
jcr = JS["single_moderate_crack"]
check("browser agrees a crack isn't 'Excellent'", jcr["score"] <= 88, f"browser {jcr['score']}")

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
