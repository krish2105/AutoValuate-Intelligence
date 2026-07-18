"""
E5 — "too good to be true" detection on comparable listings.

A listing priced far below what its own specs predict is the cheapest available signal for a
rolled-back odometer, an undisclosed accident, or a scam. We already have a model that prices
a car from its specs and a *measured* distribution of how far honest listings sit from it, so
the flag is that distribution's lower tail — nothing more exotic is warranted.

**Why not an isolation forest** (which the plan proposed): it finds unusual *feature combos*
(a 2-cylinder Land Cruiser), not unusual *prices*. The question here is "is this price wrong
for this car", which is exactly a residual against the price model. An isolation forest would
add a dependency and answer a different question.

Calibration, not vibes: the threshold is the ANOMALY_PCTILE (2.5%) quantile of signed
held-out residuals **per brand tier**, measured in `train_valuation.py`. So ~1 in 40 genuine
listings trips it by construction. That is why the wording is "worth verifying" and never
"fraud" — at 5 comparables per valuation this fires on roughly 1 in 8 honest result sets.

Falls back to silence (no flags) on any older bundle that lacks the calibrated floor: a
missing threshold must never become an uncalibrated accusation.
"""
from __future__ import annotations

import math
from typing import Any

from models import brand_tier, valuation_model

# Only fields the model actually consumes; a comparable record carries all of them.
_FEATURES = ("make", "model", "year", "kilometers", "bodyType", "transmissionType",
             "fuelType", "regionalSpecs", "sellerType", "city", "noOfCylinders")


def _floor_for(make: str, bundle: dict) -> float | None:
    floors = bundle.get("anomaly_resid_floor_by_tier")
    if not floors:
        return None
    # Must use the SAME tier rule as valuation_model._tier_delta — an exact-string match
    # here tiered "land rover" as mass while the price band tiered it luxury, so the two
    # halves of one valuation disagreed and Land Rovers were checked against the wrong
    # (more permissive) anomaly floor. See models/brand_tier.py.
    luxury = set(bundle.get("brand_tier_luxury", ()))
    tier = "luxury" if brand_tier.is_luxury(make, luxury) else "mass"
    return floors.get(tier)


def annotate(comparables: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Add `price_anomaly` to each comparable that is suspiciously cheap for its specs.

    Mutates nothing: returns new dicts. Any comparable we cannot price is left untouched
    rather than flagged — an unpriceable car is unknown, not suspicious.
    """
    try:
        bundle = valuation_model._load()
    except Exception:
        return comparables

    out: list[dict[str, Any]] = []
    for c in comparables:
        row = dict(c)
        price = c.get("price_aed")
        floor = _floor_for(c.get("make", ""), bundle)
        if floor is None or not price or price <= 0:
            out.append(row)
            continue
        try:
            vehicle = {k: c.get(k) for k in _FEATURES if c.get(k) is not None}
            pred = valuation_model.predict(vehicle)
            fair = pred["price_mid_aed"]
            resid = math.log1p(float(price)) - math.log1p(float(fair))
            if resid < floor:
                row["price_anomaly"] = {
                    "fair_price_aed": round(fair),
                    "below_fair_pct": round((1 - float(price) / fair) * 100, 1),
                    "reason": (
                        f"Priced {round((1 - float(price) / fair) * 100)}% below the "
                        f"{int(fair):,} AED this car's own specs predict — cheaper than "
                        f"{100 - bundle.get('anomaly_pctile', 0.025) * 100:.1f}% of genuine "
                        f"listings like it. Worth verifying the odometer and accident history."
                    ),
                }
        except Exception:
            pass  # never let a scoring failure sink the comparables list
        out.append(row)
    return out


# Assertions live in eval/unit_tests.py, which is where this repo keeps its agent checks
# (and which the eval CI gate runs).
