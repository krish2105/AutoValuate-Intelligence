"""
Spec-join — shared logic for enriching the valuation corpus with vehicle physical specs.

Single source of truth for train_valuation.py (training), valuation_model.py (inference)
and eval/spec_join_study.py (the study that validated this join with a paired, bootstrapped,
permutation-controlled comparison — see eval/spec_join_study.json, verdict: ADOPT). Do not
duplicate this join elsewhere; import it.

The spec CSV (`data/raw/DriveArabia_All_uae.csv`, Kaggle `owaiskhan9654/uae-car-used-dataset`)
is gitignored and only needed at TRAIN time. `join()` itself takes an already-loaded specs
table, so inference can reuse the small aggregated table bundled into the joblib artifact
without ever needing the raw CSV at runtime.
"""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

try:
    from .brand_tier import make_key
except ImportError:  # executed as a top-level script — no parent package
    from brand_tier import make_key  # noqa: E402

# Physical specifications only. `Approx Cost` is deliberately absent — it is a price column
# and joining it onto a price-prediction task would be target leakage.
SPEC_NUM = {
    "Power (hp)": "spec_hp",
    "Torque (Nm)": "spec_torque",
    "Fuel Econ (L/100km)": "spec_l100km",
    "Performance 0-100 kph (sec)": "spec_0to100",
    "Top speed (kph)": "spec_topspeed",
    "Weight": "spec_weight",
}
SPEC_FEATURES = list(SPEC_NUM.values())
BANNED = ("cost", "price", "aed", "msrp", "value")  # any of these in a used column = leakage


def _first_number(v) -> float:
    """'1730 - 1920' / '272' / '7.4' -> the first number. Spec fields carry ranges and units."""
    if pd.isna(v):
        return np.nan
    m = re.search(r"\d+(?:\.\d+)?", str(v).replace(",", ""))
    return float(m.group()) if m else np.nan


def _norm_model(v) -> str:
    """Loose model key: lowercase, strip punctuation/spaces. 'CLS-Class' == 'cls class'."""
    return re.sub(r"[^a-z0-9]", "", str(v or "").lower())


def load_specs(path: Path) -> pd.DataFrame:
    """Read the raw DriveArabia CSV and aggregate to one row per (make, model, year)."""
    s = pd.read_csv(path)
    for col in SPEC_NUM:
        assert not any(b in col.lower() for b in BANNED), f"leaky spec column selected: {col}"
    assert "Approx Cost" not in SPEC_NUM, "Approx Cost is a price column — never join it"

    out = pd.DataFrame({
        "k_make": s["Manufacturer"].map(make_key),
        "k_model": s["Brand"].map(_norm_model),
        "k_year": pd.to_numeric(s["Model Year"], errors="coerce"),
    })
    for src, dst in SPEC_NUM.items():
        out[dst] = s[src].map(_first_number) if src in s.columns else np.nan
    out = out.dropna(subset=["k_make", "k_model"])
    # One spec row per nameplate-year: the table lists trims, so aggregate to the median.
    return out.groupby(["k_make", "k_model", "k_year"], as_index=False).median(numeric_only=True)


def join(df: pd.DataFrame, specs: pd.DataFrame) -> tuple[pd.DataFrame, float]:
    """Left-join specs onto df (needs make/model/year columns). Falls back from an exact
    (make, model, year) match to the nameplate's median across years when the year misses."""
    d = df.copy()
    d["k_make"] = d["make"].map(make_key)
    d["k_model"] = d["model"].map(_norm_model)
    d["k_year"] = pd.to_numeric(d["year"], errors="coerce")

    m = d.merge(specs, on=["k_make", "k_model", "k_year"], how="left")
    nameplate = specs.groupby(["k_make", "k_model"], as_index=False).median(numeric_only=True).drop(columns=["k_year"])
    m = m.merge(nameplate, on=["k_make", "k_model"], how="left", suffixes=("", "_np"))
    for c in SPEC_FEATURES:
        m[c] = m[c].fillna(m[f"{c}_np"])
    m = m.drop(columns=[f"{c}_np" for c in SPEC_FEATURES])
    match_rate = float(m[SPEC_FEATURES].notna().any(axis=1).mean())
    return m, match_rate
