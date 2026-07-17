"""
Repair-cost estimator (Phase F).

Turns detected damage into an itemised AED repair range for the UAE market, so the user
sees the causal chain: detection -> repair cost -> what the car is worth fixed vs as-is.

Deliberately a transparent lookup table, not a learned model. We have no labelled
repair-invoice data, so a regression here would be a confident-sounding guess. A published
table can be audited, argued with, and corrected by a workshop — and every figure it emits
is traceable, which is the same contract the rest of the pipeline honours.

Ranges are indicative UAE independent-workshop prices (not main-dealer), per instance.
"""
from __future__ import annotations

from typing import Any

# damage class -> (low AED, high AED) per instance, at moderate severity
BASE_COST: dict[str, tuple[int, int]] = {
    "scratch":       (150, 600),      # polish/touch-up -> panel respray
    "dent":          (300, 1_200),    # paintless dent removal -> panel beat + respray
    "crack":         (400, 1_500),    # bumper/trim crack repair
    "glass_shatter": (600, 2_500),    # side glass -> windscreen replacement
    "lamp_broken":   (350, 2_000),    # aftermarket -> OEM headlamp unit
    "tire_flat":     (150, 900),      # puncture repair -> new tyre
    "punctured":     (400, 1_800),    # panel puncture: fill + respray
    "missing_part":  (500, 3_500),    # trim/mirror/grille replacement
}

# severity multipliers applied to the base band
SEVERITY: dict[str, float] = {"minor": 0.6, "moderate": 1.0, "severe": 1.6}

MAX_INSTANCES_PRICED = 4   # beyond this it's a bodyshop job, not a per-item repair


VALID_SEVERITIES = ("minor", "moderate", "severe")


def _severity(finding: dict) -> str:
    """
    Severity of a finding, for pricing.

    Uses the severity the detector pipeline already graded from the crop's PIXELS
    (gradient energy, dark fraction, extent — see cv-browser.severityFromGray /
    cv_local._pixel_severity). Falls back to value_impact_pct, which encodes area and
    instance count.

    Confidence is deliberately NOT consulted. It answers "how sure is the model that this
    is a scratch?", not "how bad is this scratch?" — a crisp, well-lit, trivial scratch
    scores high confidence and a faint but deep gouge scores low. The previous version
    returned "severe" at conf >= 0.75, so a 1.6x repair multiplier keyed off model
    certainty rather than damage. It also overrode the pixel severity that had already
    been computed: the pipeline deliberately caps scratch/glass_shatter at "moderate"
    (windshields are cheap; reflections are the FP-prone class), and this silently
    re-escalated exactly those to "severe". Two definitions of severity disagreeing, with
    the worse one deciding the money.
    """
    graded = str(finding.get("severity", "") or "").lower()
    if graded in VALID_SEVERITIES:
        return graded

    # No pixel grade available (e.g. an older client). Fall back to extent only.
    impact = float(finding.get("value_impact_pct", 0) or 0)
    if impact >= 4.0:
        return "severe"
    if impact >= 2.0:
        return "moderate"
    return "minor"


def estimate(condition: dict) -> dict[str, Any]:
    """
    Itemised repair estimate for a condition report.

    Returns {available, items[], total_low_aed, total_high_aed} — `available` is False
    when no visual assessment ran, so the UI can stay honest rather than implying a
    zero-cost car.
    """
    if not condition.get("cv_available") or not condition.get("findings"):
        return {"available": False, "items": [], "total_low_aed": 0, "total_high_aed": 0}

    items: list[dict[str, Any]] = []
    lo_total = hi_total = 0

    for f in condition["findings"]:
        dmg = str(f.get("damage_type", "")).lower()
        band = BASE_COST.get(dmg)
        if not band:
            continue  # unknown class: price nothing rather than invent a number
        n = max(1, min(int(f.get("instances", 1) or 1), MAX_INSTANCES_PRICED))
        sev = _severity(f)
        mult = SEVERITY[sev]
        lo = int(round(band[0] * mult * n))
        hi = int(round(band[1] * mult * n))
        lo_total += lo
        hi_total += hi
        items.append({
            "damage_type": dmg,
            "instances": n,
            "severity": sev,
            "low_aed": lo,
            "high_aed": hi,
        })

    items.sort(key=lambda i: -i["high_aed"])
    return {
        "available": True,
        "items": items,
        "total_low_aed": lo_total,
        "total_high_aed": hi_total,
    }
