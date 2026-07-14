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
    """Fill engineered fields (age, mileage_per_year) if the caller passed raw inputs."""
    v = dict(vehicle)
    if "age" not in v and v.get("year"):
        v["age"] = max(0, reference_year - int(v["year"]))
    if "mileage_per_year" not in v and v.get("kilometers") and v.get("age"):
        v["mileage_per_year"] = round(float(v["kilometers"]) / max(1, float(v["age"])), 0)
    return v


def predict(vehicle: dict[str, Any], top_k: int = 6) -> dict[str, Any]:
    """
    Args:
        vehicle: dict with keys like make, model, year, kilometers, bodyType,
                 transmissionType, fuelType, regionalSpecs, sellerType, city,
                 noOfCylinders. Missing fields degrade gracefully.
    Returns a dict with the price range, calibrated interval, confidence, and a
    SHAP explanation (each feature's AED contribution vs the market baseline).
    """
    import shap  # imported lazily; heavy at import time

    bundle = _load()
    ref_year = bundle.get("reference_year", 2026)
    v = _derive(vehicle, ref_year)
    X = _encode(v, bundle)

    log_q50 = float(bundle["models"]["q50"].predict(X)[0])
    delta = float(bundle["conformal_delta_log"])  # calibrated 80% half-width in log space

    mid = math.expm1(log_q50)
    low = math.expm1(log_q50 - delta)
    high = math.expm1(log_q50 + delta)

    # SHAP explanation on the q50 model (log-space contributions -> approx AED)
    explainer = shap.TreeExplainer(bundle["models"]["q50"])
    sv = explainer.shap_values(X)[0]
    base = float(explainer.expected_value)
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

    return {
        "price_low_aed": round(low, 0),
        "price_mid_aed": round(mid, 0),
        "price_high_aed": round(high, 0),
        "interval_coverage": bundle.get("conformal_coverage", 0.8),
        "interval_pct_width": round((high - low) / mid * 100, 1),
        "currency": "AED",
        "explanation": {
            "baseline_log": round(base, 4),
            "top_factors": contribs[:top_k],
        },
        "model_meta": {
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
