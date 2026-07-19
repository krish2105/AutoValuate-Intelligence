"""
Measure how stable a scan is under trivially different framing of the SAME photo.

WHY THIS EXISTS
---------------
A user reported the score "keeps changing" for the same car. The pipeline is deterministic
(scripts/cv-determinism-run.mjs proves identical bytes -> identical score, and 10 repeat runs
here give one score). The instability is the MODEL: its detections depend heavily on framing.

Measured on a wrecked Civic, same damage, imperceptibly different photos:

    original      38   crack, missing_part
    crop 3%       85   crack
    crop 6%       62   crack
    crop 10%      78   missing_part
    stood back    85   dent, lamp_broken
    resize 70%    85   lamp_broken
    => score range 47 points; the reported damage CLASS changes entirely

A 3% crop is invisible to a human and swings the score by 47 points. Note the class flips
between missing_part (BASE_SEVERITY 0.28) and lamp_broken (0.07) — a 4x severity difference —
so the score inherits the model's confusion about WHAT the damage is, not merely how confident
it is.

FOUR POST-PROCESSING FIXES WERE TRIED AND ALL FAILED (do not re-try without new evidence):
  1. Multi-scale fusion (extra zoom passes + WBF)  -> range 47 -> 47, stdev 16.0 -> 18.6 (worse)
  2. Softening the confidence gate (0.20/0.35 floor -> 0.10/0.05) -> range 47 -> 47
  3. Threshold tuning -> trades a false negative for a false positive, never both
  4. Leaning on coverage instead of class labels -> coverage itself ranges 0.022-0.152 (7x)

The conclusion is that this is not fixable downstream: the detections themselves are unstable,
and everything after them inherits it. The fix is retraining on in-domain (UAE, whole-car)
photos — see docs/CV_FINDINGS.md and the accuracy plan. Use this script to MEASURE that a
retrained model is actually better, rather than trusting a single-photo demo.

Usage:  python scripts/stability_check.py <image> [more images...]
"""
import sys, base64, statistics
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend-api"))
from agents import cv_local as CV, aggregation_agent as AG  # noqa: E402


def _score(img):
    cv2.imwrite("/tmp/_stability.png", img)
    dets = CV.detect(base64.b64encode(open("/tmp/_stability.png", "rb").read()).decode())
    oa, od = CV.available, CV.detect
    CV.available = lambda: True
    CV.detect = lambda _p, _d=dets: [dict(z) for z in _d]
    try:
        r = AG.aggregate({"photos": ["_"]})
    finally:
        CV.available, CV.detect = oa, od
    classes = ",".join(sorted({f["damage_type"] for f in r["findings"]})) or "none"
    return r["condition_score"], classes


def _variants(im):
    H, W = im.shape[:2]
    yield "original", im
    for p in (3, 6, 10):
        yield f"crop {p}%", im[int(H*p/100):H-int(H*p/100), int(W*p/100):W-int(W*p/100)]
    for p in (10, 25):
        px, py = int(W*p/100), int(H*p/100)
        yield f"stood back {p}%", cv2.copyMakeBorder(im, py, py, px, px, cv2.BORDER_REPLICATE)
    yield "resize 70%", cv2.resize(im, (int(W*.7), int(H*.7)))


def main() -> int:
    paths = sys.argv[1:]
    if not paths:
        print(__doc__)
        print("give me one or more image paths")
        return 1
    worst = 0
    for path in paths:
        im = cv2.imread(path)
        if im is None:
            print(f"could not read {path}")
            continue
        print(f"\n=== {path} ===")
        print("%-18s %-7s %s" % ("framing", "score", "classes"))
        scores = []
        for name, img in _variants(im):
            s, c = _score(img)
            scores.append(s)
            print("%-18s %-7d %s" % (name, s, c))
        rng = max(scores) - min(scores)
        worst = max(worst, rng)
        print("  range %d points, stdev %.1f  -- %s" % (
            rng, statistics.pstdev(scores),
            "STABLE" if rng <= 10 else "UNSTABLE (the same car should not span this)"))
    print("\nworst range across all images: %d points" % worst)
    # A retrained model should shrink this. Non-zero exit makes it usable as a gate later.
    return 0 if worst <= 15 else 2


if __name__ == "__main__":
    raise SystemExit(main())
