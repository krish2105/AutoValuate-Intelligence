"""
AutoValuate — valuation model wrapper (loaded in-process by the FastAPI backend).

Loads the trained XGBoost quantile bundle (notebook 05) and exposes a single
`predict()` that returns a calibrated price range plus a SHAP-based, citation-ready
explanation. Every number the report agent later cites about price traces back to
one of these outputs (a q50 estimate, a conformal bound, or a SHAP contribution).
"""
from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

_BUNDLE_PATH = Path(__file__).with_name("valuation_model.joblib")


@lru_cache(maxsize=1)
def _artifact_version() -> str:
    """Short content hash of the model artifact (WS E3): every valuation names the exact
    model that priced it, so a rollback or retrain is attributable in logs and reports."""
    import hashlib
    return hashlib.sha256(_BUNDLE_PATH.read_bytes()).hexdigest()[:12]


@lru_cache(maxsize=1)
def _load() -> dict:
    if not _BUNDLE_PATH.exists():
        raise FileNotFoundError(
            f"{_BUNDLE_PATH} missing — run notebooks/05_xgboost_valuation_train.ipynb"
        )
    return joblib.load(_BUNDLE_PATH)


def _encode(vehicle: dict[str, Any], bundle: dict) -> pd.DataFrame:
    row = {}
    for c in bundle["categorical_features"]:
        raw = str(vehicle.get(c, "")).strip()
        # unseen category -> -1 (XGBoost sends it down the learned default branch)
        row[c] = bundle["cat_maps"][c].get(raw, -1)
    for n in bundle["numeric_features"]:
        v = vehicle.get(n, None)
        row[n] = float(v) if v not in (None, "") else np.nan
    X = pd.DataFrame([row], columns=bundle["features"])
    for c in bundle["categorical_features"]:
        X[c] = X[c].astype("int32")
    for n in bundle["numeric_features"]:
        X[n] = X[n].astype("float32")
    return X


def _derive(vehicle: dict[str, Any], reference_year: int) -> dict[str, Any]:
    """Fill engineered fields (age) if the caller passed raw inputs.

    `mileage_per_year` used to be derived here and fed to the model. It was dropped in the
    B3 ablation: being km/age-derived, sweeping age lowered it — a *positive* signal — which
    pushed price back up and defeated the age monotonicity constraint. Removing it improved
    accuracy. Nothing reads it now; do not reintroduce it without re-running the sweep gate.
    """
    v = dict(vehicle)
    if "age" not in v and v.get("year"):
        v["age"] = max(0, reference_year - int(v["year"]))
    return v


def _tier_delta(vehicle: dict[str, Any], bundle: dict) -> tuple[str, float]:
    """Mondrian conformal: the interval half-width calibrated for this car's brand tier.

    A single global delta is 80% *on average* while covering luxury cars only ~75% — an
    average that is wrong for an identifiable group of users. Luxury gets a wider, honest
    band. Unknown makes fall back to the global delta.
    """
    by_tier = bundle.get("conformal_delta_log_by_tier")
    if not by_tier:  # pre-Mondrian artifact
        return "global", float(bundle["conformal_delta_log"])
    luxury = set(bundle.get("brand_tier_luxury", ()))
    tier = "luxury" if str(vehicle.get("make", "")).strip().lower() in luxury else "mass"
    return tier, float(by_tier.get(tier, bundle["conformal_delta_log"]))


def predict(vehicle: dict[str, Any], top_k: int = 6) -> dict[str, Any]:
    """
    Args:
        vehicle: dict with keys like make, model, year, kilometers, bodyType,
                 transmissionType, fuelType, regionalSpecs, sellerType, city,
                 noOfCylinders. Missing fields degrade gracefully.
    Returns a dict with the price range, calibrated interval, confidence, and a
    SHAP explanation (each feature's AED contribution vs the market baseline).
    """
    bundle = _load()
    ref_year = bundle.get("reference_year", 2026)
    v = _derive(vehicle, ref_year)
    X = _encode(v, bundle)

    log_q50 = float(bundle["models"]["q50"].predict(X)[0])
    tier, delta = _tier_delta(v, bundle)  # calibrated 80% half-width in log space

    # log1p/expm1 are exact inverses — the training target is log1p(price).
    mid = math.expm1(log_q50)
    low = math.expm1(log_q50 - delta)
    high = math.expm1(log_q50 + delta)

    # SHAP explanation via XGBoost's built-in TreeSHAP (pred_contribs) — identical
    # values to the shap library, but no heavy shap/numba import (fits the free tier).
    import xgboost as xgb
    booster = bundle["models"]["q50"].get_booster()
    contribs_raw = booster.predict(xgb.DMatrix(X), pred_contribs=True)[0]  # (n_features + 1,)
    sv = contribs_raw[:-1]
    base = float(contribs_raw[-1])
    contribs = []
    for feat, s in zip(bundle["features"], sv):
        # convert log-space contribution to an approximate AED delta around the mid
        aed_delta = mid * (math.exp(s) - 1.0)
        contribs.append({
            "feature": feat,
            "value": v.get(feat),
            "shap_log": round(float(s), 4),
            "approx_aed_impact": round(aed_delta, 0),
        })
    contribs.sort(key=lambda c: abs(c["shap_log"]), reverse=True)

    # Report the coverage measured for THIS car's tier, not the flattering overall average.
    tier_cov = (bundle.get("conformal_coverage_by_tier") or {}).get(tier, {})
    return {
        "price_low_aed": round(low, 0),
        "price_mid_aed": round(mid, 0),
        "price_high_aed": round(high, 0),
        "interval_coverage": tier_cov.get("coverage", bundle.get("conformal_coverage", 0.8)),
        "interval_pct_width": round((high - low) / mid * 100, 1),
        "interval_segment": tier,
        "currency": "AED",
        "explanation": {
            "baseline_log": round(base, 4),
            "top_factors": contribs[:top_k],
        },
        "model_meta": {
            "model_version": _artifact_version(),
            "cv_median_ape_pct": bundle["cv_metrics"]["median_APE_pct"]["mean"],
            "cv_mae_aed": bundle["cv_metrics"]["MAE_AED"]["mean"],
            "training_rows": bundle["training_rows"],
            "dataset": bundle["dataset"],
        },
    }


if __name__ == "__main__":
    import json
    demo = {
        "make": "toyota", "model": "corolla", "year": 2019, "kilometers": 90000,
        "bodyType": "Sedan", "transmissionType": "Automatic", "fuelType": "Petrol",
        "regionalSpecs": "GCC", "sellerType": "Dealer", "city": "Dubai",
        "noOfCylinders": 4,
    }
    print(json.dumps(predict(demo), indent=2, default=str))
