"""
Aggregation agent (Phase 6): turn per-photo CV detections into one Condition Report.

Calls the CV inference Space (Hugging Face) per photo when `CV_SERVICE_URL` is set,
merges detections across photos into per-damage-class findings, computes a 0–100
Condition Score, and derives a price-adjustment factor the valuation step applies.

When the CV service is not configured/reachable (e.g. before Phase 3 is deployed),
it returns an honest `cv_available: False` report — the confidence-disclosure contract
then tells the user the visual assessment was skipped, rather than faking damage data.
"""
from __future__ import annotations

import os
from typing import Any

import httpx

# Base cosmetic severity per class — value fraction a *reference-sized* (~4% of frame)
# instance costs. Extent (bbox area) + confidence scale this per detection below. Keep in
# lock-step with frontend/lib/cv-browser.ts BASE_SEVERITY.
BASE_SEVERITY = {
    "scratch": 0.010,
    "dent": 0.020,
    "lamp_broken": 0.020,
    "crack": 0.030,
    "glass_shatter": 0.045,
    "tire_flat": 0.015,
    "punctured": 0.035,
    "missing_part": 0.050,
}
STRUCTURAL = {"crack", "glass_shatter", "punctured", "missing_part"}
CONF_THRESHOLD = 0.35
LARGE_AREA = 0.10        # ≥10% of frame ⇒ structural regardless of class (a crush, not a ding)
REF_AREA = 0.04
STRUCT_COEF = 1.7
STRUCT_CAP = 0.62
COSMETIC_AREA_CAP = 3.0
CONF_LO, CONF_HI = 0.20, 0.55
MAX_TOTAL_DEDUCTION = 0.55  # photos alone can't wipe out >55%; rest disclosed as uncertainty


def _box_area(box) -> float:
    if not box or len(box) < 4:
        return REF_AREA  # no box → assume a reference-sized instance
    return max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])


def _conf_weight(c: float) -> float:
    return max(0.15, min(1.0, (c - CONF_LO) / (CONF_HI - CONF_LO)))


def _det_impact(label: str, area: float, conf: float) -> float:
    cw = _conf_weight(conf)
    if label in STRUCTURAL or area >= LARGE_AREA:
        return cw * min(STRUCT_CAP, STRUCT_COEF * area)
    area_mult = max(0.4, min(COSMETIC_AREA_CAP, area / REF_AREA))
    return cw * BASE_SEVERITY[label] * area_mult


def _severity_of(label: str, area: float) -> str:
    if area >= 0.15 or (label in STRUCTURAL and area >= 0.06):
        return "severe"
    if area >= 0.05 or label in STRUCTURAL:
        return "moderate"
    return "minor"


def _assessment_band(score: int) -> str:
    if score >= 90:
        return "Excellent — minimal visible damage"
    if score >= 78:
        return "Good — minor cosmetic damage"
    if score >= 60:
        return "Fair — notable damage"
    if score >= 45:
        return "Poor — significant damage"
    return "Severe — major / likely structural damage"


def _call_cv(url: str, photo: str, timeout: float) -> list[dict]:
    """POST one image to the CV Space; expects {detections:[{label,confidence,box}]}."""
    payload = {"image": photo}  # base64 or URL; the Space accepts either (Phase 3)
    r = httpx.post(url.rstrip("/") + "/detect", json=payload, timeout=timeout)
    r.raise_for_status()
    return r.json().get("detections", [])


def aggregate(vehicle: dict[str, Any], timeout: float = 30.0) -> dict[str, Any]:
    from . import cv_local
    url = os.environ.get("CV_SERVICE_URL", "").strip()
    photos = vehicle.get("photos", []) or []
    use_local = cv_local.available()

    if (not url and not use_local) or not photos:
        return {
            "cv_available": False,
            "reason": ("no photos provided" if (url or use_local) else "no CV service configured"),
            "condition_score": None,
            "price_adjustment_factor": 1.0,
            "findings": [],
            "photos_assessed": 0,
        }

    per_class: dict[str, dict] = {}
    assessed = 0
    for i, photo in enumerate(photos):
        try:
            dets = cv_local.detect(photo) if use_local else _call_cv(url, photo, timeout)
            assessed += 1
        except Exception:
            continue  # skip unreachable/failed image, keep going
        for d in dets:
            label = d.get("label")
            conf = float(d.get("confidence", 0))
            if label not in BASE_SEVERITY or conf < CONF_THRESHOLD:
                continue
            area = _box_area(d.get("box"))
            slot = per_class.setdefault(
                label, {"max_conf": 0.0, "photos": set(), "impacts": [], "worst_area": 0.0}
            )
            slot["max_conf"] = max(slot["max_conf"], conf)
            slot["photos"].add(i)
            slot["impacts"].append(_det_impact(label, area, conf))
            slot["worst_area"] = max(slot["worst_area"], area)

    if assessed == 0:
        return {
            "cv_available": False,
            "reason": "CV service unreachable for all photos",
            "condition_score": None,
            "price_adjustment_factor": 1.0,
            "findings": [],
            "photos_assessed": 0,
        }

    # Probabilistic union across every detection — area- and confidence-weighted — so the
    # score reflects how much of the car is damaged, not merely how many boxes fired. (The
    # old count-based sum scored a crushed front-end the same as one door ding: −2%.)
    findings, kept_all = [], 1.0
    for label, s in sorted(per_class.items(), key=lambda kv: -sum(kv[1]["impacts"])):
        kept_class = 1.0
        for imp in s["impacts"]:
            kept_class *= (1 - imp)
            kept_all *= (1 - imp)
        findings.append({
            "damage_type": label,
            "instances": len(s["impacts"]),
            "max_confidence": round(s["max_conf"], 3),
            "photos_with_damage": sorted(s["photos"]),
            "value_impact_pct": round((1 - kept_class) * 100, 1),
            "severity": _severity_of(label, s["worst_area"]),
        })

    deduction = min(MAX_TOTAL_DEDUCTION, 1 - kept_all)
    # round-half-up (not Python's banker's rounding) so it matches the browser's Math.round
    condition_score = int(100 * (1 - deduction) + 0.5)
    needs_inspection = condition_score < 70 or any(f["severity"] == "severe" for f in findings)
    return {
        "cv_available": True,
        "condition_score": condition_score,
        "price_adjustment_factor": round(1 - deduction, 4),
        "findings": findings,
        "photos_assessed": assessed,
        "total_value_impact_pct": round(deduction * 100, 1),
        "assessment": _assessment_band(condition_score),
        "needs_inspection": needs_inspection,
    }
