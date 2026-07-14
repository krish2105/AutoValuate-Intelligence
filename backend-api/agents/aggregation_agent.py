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

# Per-class severity weight (fraction of value typically lost per confident instance).
# Deliberately conservative; documented in DECISIONS.md. Structural/mechanical > cosmetic.
DAMAGE_SEVERITY = {
    "scratch": 0.010,
    "dent": 0.020,
    "lamp_broken": 0.020,
    "crack": 0.030,
    "glass_shatter": 0.045,
    "tire_flat": 0.015,
    "punctured": 0.035,
    "missing_part": 0.050,
}
CONF_THRESHOLD = 0.35
MAX_TOTAL_DEDUCTION = 0.35  # never claim damage wipes out >35% of value


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
            if label not in DAMAGE_SEVERITY or conf < CONF_THRESHOLD:
                continue
            slot = per_class.setdefault(label, {"count": 0, "max_conf": 0.0, "photos": set()})
            slot["count"] += 1
            slot["max_conf"] = max(slot["max_conf"], conf)
            slot["photos"].add(i)

    if assessed == 0:
        return {
            "cv_available": False,
            "reason": "CV service unreachable for all photos",
            "condition_score": None,
            "price_adjustment_factor": 1.0,
            "findings": [],
            "photos_assessed": 0,
        }

    findings, deduction = [], 0.0
    for label, s in sorted(per_class.items(), key=lambda kv: -kv[1]["count"]):
        sev = DAMAGE_SEVERITY[label]
        # diminishing marginal deduction per additional instance of the same damage
        contrib = sev * (1 + 0.5 * (s["count"] - 1))
        deduction += contrib
        findings.append({
            "damage_type": label,
            "instances": s["count"],
            "max_confidence": round(s["max_conf"], 3),
            "photos_with_damage": sorted(s["photos"]),
            "value_impact_pct": round(contrib * 100, 1),
        })

    deduction = min(deduction, MAX_TOTAL_DEDUCTION)
    condition_score = round(100 * (1 - deduction))
    return {
        "cv_available": True,
        "condition_score": condition_score,
        "price_adjustment_factor": round(1 - deduction, 4),
        "findings": findings,
        "photos_assessed": assessed,
        "total_value_impact_pct": round(deduction * 100, 1),
    }
