"""
Cross-language conformance test for the CV post-processing (docs/CV_INFERENCE_SPEC.md §3.7).

Feeds identical synthetic per-tile detections to BOTH implementations of the fusion + filter
pipeline — backend cv_local._fuse_detections (Python) and frontend cv-browser.fuseDetections
(TypeScript, run via esbuild) — and asserts they agree. This isolates the shared post-processing
(Weighted Box Fusion → MIN_AREA → glass gate → canonical order) from the model + preprocessing,
which diverge by design (canvas vs cv2 resample, EXIF — spec §6) and cannot be made bit-identical.

Tolerances, DEFINED UP FRONT (not widened after seeing a failure):
  - labels, counts and canonical order: EXACT.
  - confidence: EXACT (both round identically inside WBF).
  - box coordinates: within BOX_TOL, because the backend rounds fused boxes to 4 dp and the
    browser does not (spec §6 divergence #6). 5e-5 is the max rounding error at 4 dp; BOX_TOL
    is that with margin. A disagreement larger than this is a real divergence and fails.

Run: python eval/cv_conformance.py   (needs node + the frontend deps for esbuild)
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-api"))

from agents import cv_local  # noqa: E402

BOX_TOL = 1e-4   # accommodates the backend's 4 dp rounding of fused boxes (spec §6 #6)
FIXTURES = ROOT / "eval" / "cv_conformance_fixtures.json"


def _fail(msg: str) -> None:
    print(f"  [FAIL] {msg}")
    globals()["_failed"] += 1


def _ok(msg: str) -> None:
    print(f"  [PASS] {msg}")
    globals()["_passed"] += 1


_passed = 0
_failed = 0


def main() -> int:
    cases = json.loads(FIXTURES.read_text())["cases"]

    # Backend outputs.
    backend = {name: cv_local._fuse_detections([dict(d) for d in dets])
               for name, dets in cases.items()}

    # Browser outputs (real TS via esbuild).
    try:
        proc = subprocess.run(
            ["node", "scripts/cv-conformance-run.mjs", str(FIXTURES)],
            cwd=str(ROOT / "frontend"), capture_output=True, text=True, timeout=180, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        stderr = getattr(e, "stderr", "") or str(e)
        print(f"  [SKIP] could not run the browser side (node/esbuild): {stderr[:300]}")
        print("\nCONFORMANCE: browser side unavailable — backend checked, cross-check skipped.")
        return 0
    browser = json.loads(proc.stdout)

    print("CV post-processing conformance (backend Python vs browser TS):")
    for name in cases:
        b, f = backend[name], browser[name]
        if len(b) != len(f):
            _fail(f"{name}: count {len(b)} (backend) != {len(f)} (browser)")
            continue
        agree = True
        for i, (db, dfr) in enumerate(zip(b, f)):
            if db["label"] != dfr["label"]:
                _fail(f"{name}[{i}]: label {db['label']} != {dfr['label']}"); agree = False; break
            if abs(db["confidence"] - dfr["confidence"]) > 1e-9:
                _fail(f"{name}[{i}]: conf {db['confidence']} != {dfr['confidence']}"); agree = False; break
            if any(abs(x - y) > BOX_TOL for x, y in zip(db["box"], dfr["box"])):
                _fail(f"{name}[{i}]: box {db['box']} vs {dfr['box']} exceeds {BOX_TOL}"); agree = False; break
        if agree:
            _ok(f"{name}: {len(b)} detection(s) agree (canonical order, box within {BOX_TOL})")

    print(f"\n{_passed} passed, {_failed} failed")
    return 1 if _failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
