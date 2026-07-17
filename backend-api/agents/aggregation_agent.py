"""
Aggregation agent (Phase 6): turn per-photo CV detections into one Condition Report.

Runs the in-process detector (agents/cv_local.py) over each photo, merges detections
across photos into per-damage-class findings, computes a 0–100 Condition Score, and
derives a price-adjustment factor the valuation step applies.

In production the scan runs in the BROWSER and this path is skipped entirely (see
graph/orchestrator.n_aggregate); it exists for server-side callers that post photos.
cv_local is the only server-side detector — the remote CV Space route was removed because
it was a silently divergent second implementation. See docs/CV_INFERENCE_SPEC.md.

When no detector is available or no photos are given, it returns an honest
`cv_available: False` report — the confidence-disclosure contract then tells the user the
visual assessment was skipped, rather than faking damage data.
"""
from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)

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
# Damage-EXTENT escalation — parity with frontend/lib/cv-browser.ts. The model labels a whole
# crushed side as a few "dent" boxes, and cosmetic dents alone can only deduct ~30%, so a real
# wreck read as "minor cosmetic". Coverage (how much of the car is damaged) is a label-agnostic
# major-damage signal; above the knee it escalates the deduction. Tuned in scratch/tune_extent.py.
EXTENT_KNEE = 0.10
EXTENT_ESC = 12.0
EXTENT_SEVERE_COV = 0.20   # coverage at/above which the worst finding reads "severe"
COV_GRID = 48
# A structural finding (crack/impact) graded moderate+ implies real, possibly-hidden damage, so it
# floors the deduction — a detected crack can't leave the car reading "Excellent" on a small box.
# Parity with frontend/lib/cv-browser.ts. glass_shatter is excluded (genuinely cheap to replace).
STRUCT_MOD_FLOOR = 0.15
STRUCT_SEV_FLOOR = 0.28
# Fallback when a detection carries no pixel `sev` (e.g. the remote CV Space): estimate from area.
_FALLBACK_PRIOR = {"glass_shatter": 0.15, "missing_part": 0.20, "punctured": 0.15, "crack": 0.10, "lamp_broken": 0.08}


def _coverage(boxes) -> float:
    """Union fraction of the frame covered by damage boxes (grid-rasterized so overlaps aren't
    double-counted). The label-agnostic 'how much of the car is damaged' signal. Parity with
    cv-browser.damageCoverage (same COV_GRID + floor/ceil rasterization)."""
    if not boxes:
        return 0.0
    import math
    g = COV_GRID
    grid = bytearray(g * g)
    for b in boxes:
        if not b or len(b) < 4:
            continue
        x0, x1 = max(0, math.floor(b[0] * g)), min(g, math.ceil(b[2] * g))
        y0, y1 = max(0, math.floor(b[1] * g)), min(g, math.ceil(b[3] * g))
        for gy in range(y0, y1):
            for gx in range(x0, x1):
                grid[gy * g + gx] = 1
    return sum(grid) / (g * g)


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


def _assessment_band(score: int, has_moderate_plus: bool = False) -> str:
    # A scan that FOUND a moderate/severe issue cannot also call the damage "minimal" — parity
    # with cv-browser.assessmentBand.
    if score >= 90 and not has_moderate_plus:
        return "Excellent — minimal visible damage"
    if score >= 78:
        return ("Good — visible damage; inspect the flagged area"
                if has_moderate_plus else "Good — minor cosmetic damage")
    if score >= 60:
        return "Fair — notable damage"
    if score >= 45:
        return "Poor — significant damage"
    return "Severe — major / likely structural damage"


def aggregate(vehicle: dict[str, Any], timeout: float = 30.0) -> dict[str, Any]:
    """
    Server-side CV aggregation. Only ever runs when a request supplies photos AND no
    browser-produced client_condition (see graph/orchestrator.n_aggregate).

    The remote CV Space route was REMOVED here. It was a third, silently different
    definition of "the detector": cv-service/app.py had no tiling, no Weighted Box Fusion,
    no pixel-severity head, no TILE_EXCLUDE and no GLASS_CONF gate, so the same photo could
    yield a different condition — and therefore a different price — depending on an env var.
    It was already unreachable in the shipped configuration (it required CV_SERVICE_URL set,
    ENABLE_LOCAL_CV unset, no client_condition, and photos present; compose.yaml never
    defined the service). There is now exactly one server-side detector: cv_local.
    See docs/CV_INFERENCE_SPEC.md.
    """
    from . import cv_local
    photos = vehicle.get("photos", []) or []
    use_local = cv_local.available()

    if not use_local or not photos:
        return {
            "cv_available": False,
            "reason": ("no photos provided" if use_local else "no CV service configured"),
            "condition_score": None,
            "price_adjustment_factor": 1.0,
            "findings": [],
            "photos_assessed": 0,
        }

    per_class: dict[str, dict] = {}
    assessed = 0
    failures: list[str] = []
    max_coverage = 0.0  # largest single-photo damage coverage (the extent signal)
    for i, photo in enumerate(photos):
        try:
            dets = cv_local.detect(photo)
            assessed += 1
        except Exception as e:
            # Recorded, not swallowed. This was a bare `except Exception: continue` with no
            # logging, so a corrupt image, an ONNX failure and a timeout were
            # indistinguishable — and 7 of 8 photos failing still reported a confident
            # assessment based on the one that worked.
            failures.append(f"photo {i}: {type(e).__name__}: {e}")
            log.warning("CV failed on photo %d: %s", i, e)
            continue
        kept_boxes = []
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
            kept_boxes.append(d.get("box"))
        max_coverage = max(max_coverage, _coverage(kept_boxes))

    if assessed == 0:
        return {
            "cv_available": False,
            "reason": "the detector failed on every photo",
            "errors": failures,
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

    # Escalations. (1) Accident: co-occurring structural findings signal a collision. (2) Extent:
    # damage spread over a large AREA is major damage even when only labelled "dent" — this is what
    # stops a crushed side reading as "minor cosmetic". Parity with cv-browser.conditionFromDetections.
    deduction = 1 - kept_all
    if struct_hits >= 2:
        deduction = 1 - (1 - deduction) ** (1 + STRUCT_ESC * (struct_hits - 1))
    if max_coverage > EXTENT_KNEE:
        deduction = 1 - (1 - deduction) ** (1 + EXTENT_ESC * (max_coverage - EXTENT_KNEE))
    deduction = min(MAX_TOTAL_DEDUCTION, deduction)

    # Extensive coverage ⇒ the worst finding IS severe, whatever the fine label says (findings are
    # sorted highest-impact first). Scratch/glass stay capped — cheap to fix regardless of area.
    if max_coverage >= EXTENT_SEVERE_COV and findings \
            and findings[0]["damage_type"] not in ("scratch", "glass_shatter"):
        findings[0]["severity"] = "severe"

    # Structural-finding floor: a detected moderate/severe crack/impact can't leave the car looking
    # "Excellent" on a small box. glass_shatter excluded (genuinely cheap). Parity with frontend.
    _struct = [f for f in findings if f["damage_type"] in STRUCTURAL and f["damage_type"] != "glass_shatter"]
    if any(f["severity"] == "severe" for f in _struct):
        deduction = max(deduction, STRUCT_SEV_FLOOR)
    elif any(f["severity"] == "moderate" for f in _struct):
        deduction = max(deduction, STRUCT_MOD_FLOOR)
    deduction = min(MAX_TOTAL_DEDUCTION, deduction)

    # round-half-up (not Python's banker's rounding) so it matches the browser's Math.round
    condition_score = int(100 * (1 - deduction) + 0.5)
    # A scan that could only read some of the photos is not a clean bill of health: the
    # photos it failed on are precisely the ones it can say nothing about. Mirrors the
    # browser's partial-scan handling (lib/cv/scan-job.ts).
    partial = assessed < len(photos)
    has_moderate_plus = any(f["severity"] != "minor" for f in findings)
    # Any structural finding warrants a physical check (it can hide damage behind the panel),
    # even at a high score. Parity with cv-browser.conditionFromDetections.
    needs_inspection = (
        condition_score < 70
        or has_moderate_plus
        or bool(_struct)
        or partial
    )
    return {
        "cv_available": True,
        "condition_score": condition_score,
        "price_adjustment_factor": round(1 - deduction, 4),
        "findings": findings,
        "photos_assessed": assessed,
        "photos_submitted": len(photos),
        "scan_status": "partial" if partial else "complete",
        "errors": failures,
        "total_value_impact_pct": round(deduction * 100, 1),
        "assessment": _assessment_band(condition_score, has_moderate_plus),
        "needs_inspection": needs_inspection,
    }
