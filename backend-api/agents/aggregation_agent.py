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
# TYPE-dominant severity (structural ≫ cosmetic). Area/confidence are bounded modifiers,
# because this detector emits few, small, sometimes-mislabelled boxes — so bbox area alone
# badly under-scored real wrecks. Calibrated on real crashed-car photos. Keep in lock-step
# with frontend/lib/cv-browser.ts BASE_SEVERITY.
BASE_SEVERITY = {
    "scratch": 0.03,
    "dent": 0.05,
    "tire_flat": 0.06,
    "lamp_broken": 0.07,
    "crack": 0.10,
    # glass_shatter is deliberately LOW: a windshield is cheap to replace (~2-5% of value) and
    # it's the model's most false-positive-prone class (sky/scene reflections read as shattering,
    # and no pixel heuristic — texture, edge-density, saturation — reliably separates them). So it
    # must never dominate a valuation; the confidence gate in cv_local.detect further filters it.
    "glass_shatter": 0.06,
    "punctured": 0.16,
    "missing_part": 0.28,
}
STRUCTURAL = {"crack", "glass_shatter", "lamp_broken", "punctured", "missing_part", "tire_flat"}
CONF_THRESHOLD = 0.33    # matches TILE_CONF — the lowest pass gate; detect() already gated
CONF_LO, CONF_HI = 0.20, 0.55
CONF_FLOOR = 0.35
SEV_MULT_LO, SEV_MULT_HI = 0.5, 2.5   # pixel severity 0..1 → impact multiplier 0.5..2.5
STRUCT_ESC = 0.4         # co-occurrence exponent per extra structural finding
MAX_TOTAL_DEDUCTION = 0.62  # photos alone can't wipe out >62%; rest disclosed as uncertainty
# Fallback when a detection carries no pixel `sev` (e.g. the remote CV Space): estimate from area.
_FALLBACK_PRIOR = {"glass_shatter": 0.15, "missing_part": 0.20, "punctured": 0.15, "crack": 0.10, "lamp_broken": 0.08}


def _box_area(box) -> float:
    if not box or len(box) < 4:
        return 0.06
    return max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])


def _sev_of_det(d: dict) -> float:
    """Pixel severity if the detector provided it; else a coarse area+class fallback."""
    s = d.get("sev")
    if s is not None:
        return float(s)
    area = _box_area(d.get("box"))
    return min(1.0, 0.6 * min(1.0, area / 0.14) + _FALLBACK_PRIOR.get(d.get("label"), 0.0))


def _conf_weight(c: float) -> float:
    return max(CONF_FLOOR, min(1.0, (c - CONF_LO) / (CONF_HI - CONF_LO)))


def _eff_weight(conf: float, sev: float) -> float:
    # Pixel evidence corroborates the detection: strong crumple/void pixels raise trust even
    # when the model's own confidence is low (a 94%-severe missing_part at conf 0.35 is real).
    cw = _conf_weight(conf)
    return min(1.0, cw + (1 - cw) * sev * 0.65)


def _det_impact(label: str, sev: float, conf: float) -> float:
    return BASE_SEVERITY[label] * (SEV_MULT_LO + (SEV_MULT_HI - SEV_MULT_LO) * sev) * _eff_weight(conf, sev)


def _severity_of(label: str, sev: float) -> str:
    # graded from the crop pixels (0..1), not box size. scratches are cosmetic and a shattered
    # windshield, though dramatic, is a cheap repair — so in a valuation context neither is "severe".
    if label in ("scratch", "glass_shatter"):
        return "moderate" if sev >= 0.5 else "minor"
    if sev >= 0.62:
        return "severe"
    if sev >= 0.34:
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
            sev = _sev_of_det(d)
            slot = per_class.setdefault(
                label, {"max_conf": 0.0, "photos": set(), "impacts": [], "worst_sev": 0.0}
            )
            slot["max_conf"] = max(slot["max_conf"], conf)
            slot["photos"].add(i)
            slot["impacts"].append(_det_impact(label, sev, conf))
            slot["worst_sev"] = max(slot["worst_sev"], sev)

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
    findings, kept_all, struct_hits = [], 1.0, 0
    for label, s in sorted(per_class.items(), key=lambda kv: -sum(kv[1]["impacts"])):
        kept_class = 1.0
        for imp in s["impacts"]:
            kept_class *= (1 - imp)
            kept_all *= (1 - imp)
        if label in STRUCTURAL:
            struct_hits += len(s["impacts"])
        findings.append({
            "damage_type": label,
            "instances": len(s["impacts"]),
            "max_confidence": round(s["max_conf"], 3),
            "photos_with_damage": sorted(s["photos"]),
            "value_impact_pct": round((1 - kept_class) * 100, 1),
            "severity": _severity_of(label, s["worst_sev"]),
        })

    # Accident escalation: co-occurring structural findings signal a collision, so amplify.
    deduction = 1 - kept_all
    if struct_hits >= 2:
        deduction = 1 - (1 - deduction) ** (1 + STRUCT_ESC * (struct_hits - 1))
    deduction = min(MAX_TOTAL_DEDUCTION, deduction)
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
