"""
Human-graded condition benchmark — the number the condition score never had.

Every scoring change so far has been validated against synthetic fixtures and photo-level
spot checks; nothing measures whether the 0-100 condition score agrees with a HUMAN looking
at the same car. This harness closes that: a person grades real cars (0-100, same scale the
product shows), the production scorer runs the same photos through the real pipeline
(cv_local.detect -> aggregation_agent.aggregate), and the report states the agreement —
Spearman rank correlation, MAE, and assessment-band agreement.

Protocol (docs in the generated template):
  1. Put each car's photos in data/raw/condition_bench/<case-id>/ (gitignored — photos of
     real cars stay out of the repo).
  2. Grade each car 0-100 in eval/condition_grades.json BEFORE looking at the model's score
     (blind grading, or the benchmark measures anchoring instead of accuracy).
  3. ENABLE_LOCAL_CV=1 python eval/condition_benchmark.py
     (needs: onnxruntime, opencv-python-headless, pillow — the cv-gate deps)

Honest by construction: with no grades it writes the template and exits 0 (a no-op, not a
fake pass); under MIN_HEADLINE cases the report is labelled directional, not a claim.
"""
from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-api"))

GRADES = ROOT / "eval" / "condition_grades.json"
REPORT = ROOT / "eval" / "condition_benchmark_report.json"
PHOTO_ROOT = ROOT / "data" / "raw" / "condition_bench"
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp"}
MIN_HEADLINE = 10  # below this, agreement numbers are directional anecdotes, and say so

TEMPLATE = {
    "_instructions": [
        "Grade each car 0-100 (the scale the product shows) BEFORE seeing the model's score.",
        "Photos live in data/raw/condition_bench/<id>/ (gitignored). 3-8 photos per car,",
        "phone-quality, walk-around style — the distribution real users produce.",
        "human_grade anchors: 95+ showroom-clean · 80s minor cosmetic · 60s notable damage",
        "· 40s significant damage · below 40 severe/structural.",
        f"At least {MIN_HEADLINE} cars before quoting the agreement as a result.",
    ],
    "cases": [
        {"id": "example-01", "human_grade": 85, "grader": "your-name",
         "notes": "one door ding, otherwise clean — replace with a real car and delete this"},
    ],
}


def _ranks(xs: list[float]) -> list[float]:
    """Average ranks (ties shared) — enough Spearman for n≈10-30 without a scipy dep."""
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    ranks = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def spearman(a: list[float], b: list[float]) -> float:
    ra, rb = _ranks(a), _ranks(b)
    n = len(a)
    ma, mb = sum(ra) / n, sum(rb) / n
    cov = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    va = sum((x - ma) ** 2 for x in ra) ** 0.5
    vb = sum((y - mb) ** 2 for y in rb) ** 0.5
    return cov / (va * vb) if va and vb else 0.0


def main() -> int:
    os.environ.setdefault("ENABLE_LOCAL_CV", "1")

    if not GRADES.exists():
        GRADES.write_text(json.dumps(TEMPLATE, indent=2) + "\n")
        print(f"no grades yet — wrote the grading template to {GRADES}.")
        print("Grade real cars (see _instructions), drop photos in "
              f"{PHOTO_ROOT}/<id>/, then re-run.")
        return 0

    from agents import aggregation_agent, cv_local
    if not cv_local.available():
        print("local CV unavailable (ENABLE_LOCAL_CV + cv-service/model/best.onnx + "
              "onnxruntime/opencv/pillow required)", file=sys.stderr)
        return 1

    spec = json.loads(GRADES.read_text())
    cases = [c for c in spec.get("cases", []) if not str(c.get("id", "")).startswith("example-")]
    rows, skipped = [], []
    for c in cases:
        cid = str(c["id"])
        pdir = PHOTO_ROOT / cid
        photos = sorted(p for p in pdir.glob("*") if p.suffix.lower() in IMG_EXT) if pdir.is_dir() else []
        if not photos:
            skipped.append({"id": cid, "reason": f"no photos in {pdir}"})
            continue
        b64 = [base64.b64encode(p.read_bytes()).decode() for p in photos]
        cond = aggregation_agent.aggregate({"photos": b64})
        if not cond.get("cv_available") or cond.get("condition_score") is None:
            skipped.append({"id": cid, "reason": cond.get("reason", "scan failed")})
            continue
        rows.append({
            "id": cid,
            "human_grade": float(c["human_grade"]),
            "model_score": int(cond["condition_score"]),
            "human_band": aggregation_agent._assessment_band(int(round(float(c["human_grade"])))),
            "model_band": cond.get("assessment", ""),
            "findings": [f["damage_type"] for f in cond.get("findings", [])],
            "photos": len(photos),
            "grader": c.get("grader", ""),
            "notes": c.get("notes", ""),
        })

    if not rows:
        print(f"no gradable cases yet ({len(skipped)} skipped). Fill {GRADES} and add photos "
              f"under {PHOTO_ROOT}/<id>/ — this stays a no-op until then.")
        return 0

    human = [r["human_grade"] for r in rows]
    model = [float(r["model_score"]) for r in rows]
    rho = round(spearman(human, model), 3)
    mae = round(sum(abs(h - m) for h, m in zip(human, model)) / len(rows), 1)
    band_agree = round(sum(r["human_band"] == r["model_band"] for r in rows) / len(rows), 3)

    report = {
        "n_cases": len(rows),
        "spearman_rho": rho,
        "mae_points": mae,
        "band_agreement": band_agree,
        "headline_quality": "ok" if len(rows) >= MIN_HEADLINE else
            f"DIRECTIONAL ONLY — {len(rows)} cases; need >= {MIN_HEADLINE} before quoting this",
        "protocol": "blind human 0-100 grades vs the production scorer "
                    "(cv_local.detect -> aggregation_agent.aggregate) on the same photos",
        "cases": rows,
        "skipped": skipped,
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n")
    print(f"n={len(rows)}  spearman={rho}  MAE={mae}pts  band-agreement={band_agree}")
    print(f"headline: {report['headline_quality']}")
    print(f"-> {REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
