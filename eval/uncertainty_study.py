"""
D3 — Uncertainty quantification study.

Question: is the split-conformal interval we ship actually better than the alternatives,
or did we just pick the one that sounded most rigorous?

We compare four ways of putting a prediction interval around the same XGBoost model, all
evaluated on the SAME held-out test split (never on data any of them was calibrated on —
that was the original sin we fixed earlier: a conformal interval calibrated and scored on
the same rows reports a coverage that is tautologically correct):

  1. raw-quantile      q10/q90 straight from quantile regression, no calibration
  2. split-conformal   symmetric ±delta around q50, delta from a held-out calibration set (SHIPPED)
  3. CQR               conformalized quantile regression — calibrate the q10/q90 band itself
  4. naive-pct         a flat ±25% band around the point estimate (the "rule of thumb" baseline)

Reported per method: empirical coverage on test (target 80%) and mean interval width.
The honest trade-off is coverage vs width — a method that hits 80% with a narrower band is
strictly better, and a method that hits 80% only by being enormously wide is useless.

Usage:  python eval/uncertainty_study.py   ->  eval/uncertainty_study.json
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb

ROOT = Path(__file__).resolve().parents[1]
CSV = ROOT / "data" / "processed" / "comparables.csv"
OUT = ROOT / "eval" / "uncertainty_study.json"

TARGET_COVERAGE = 0.80
ALPHA = 1 - TARGET_COVERAGE          # 0.20
SEED = 42
REFERENCE_YEAR = 2026

CATS = ["make", "model", "bodyType", "transmissionType", "fuelType", "regionalSpecs", "sellerType", "city"]
NUMS = ["age", "kilometers", "mileage_per_year", "noOfCylinders"]


def load() -> pd.DataFrame:
    df = pd.read_csv(CSV)
    df = df[(df["price"] > 1000) & (df["price"] < 2_000_000)].copy()
    df["age"] = (REFERENCE_YEAR - df["year"]).clip(lower=0)
    df["mileage_per_year"] = df["kilometers"] / df["age"].clip(lower=1)
    df["log_price"] = np.log1p(df["price"])
    for c in CATS:
        df[c] = df[c].astype(str).str.lower().fillna("unknown")
    for c in NUMS:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df[NUMS] = df[NUMS].fillna(df[NUMS].median())
    return df.dropna(subset=["log_price"])


def encode(df: pd.DataFrame, maps: dict | None = None):
    maps = maps or {c: {v: i for i, v in enumerate(sorted(df[c].unique()))} for c in CATS}
    X = pd.DataFrame(index=df.index)
    for c in CATS:
        X[c] = df[c].map(maps[c]).fillna(-1).astype(int)
    for c in NUMS:
        X[c] = df[c].astype(float)
    return X, maps


def fit_quantiles(Xtr, ytr):
    models = {}
    for name, q in (("q10", 0.10), ("q50", 0.50), ("q90", 0.90)):
        m = xgb.XGBRegressor(
            objective="reg:quantileerror", quantile_alpha=q,
            n_estimators=400, max_depth=5, learning_rate=0.05,
            subsample=0.9, colsample_bytree=0.9, random_state=SEED,
        )
        m.fit(Xtr, ytr)
        models[name] = m
    return models


def coverage_width(lo_log, hi_log, y_log) -> tuple[float, float]:
    """Coverage and mean width, measured in AED (log widths are not interpretable)."""
    covered = (y_log >= lo_log) & (y_log <= hi_log)
    width = np.expm1(hi_log) - np.expm1(lo_log)
    return float(covered.mean()), float(width.mean())


def main() -> int:
    df = load()
    rng = np.random.default_rng(SEED)
    idx = rng.permutation(len(df))
    n = len(df)
    n_tr, n_cal = int(0.6 * n), int(0.2 * n)
    tr, cal, te = idx[:n_tr], idx[n_tr:n_tr + n_cal], idx[n_tr + n_cal:]

    Xall, maps = encode(df)
    y = df["log_price"].to_numpy()

    Xtr, ytr = Xall.iloc[tr], y[tr]
    Xcal, ycal = Xall.iloc[cal], y[cal]
    Xte, yte = Xall.iloc[te], y[te]

    models = fit_quantiles(Xtr, ytr)
    p = {k: {"cal": m.predict(Xcal), "te": m.predict(Xte)} for k, m in models.items()}

    results: dict[str, dict] = {}

    # 1) raw quantiles — no calibration at all
    cov, wid = coverage_width(p["q10"]["te"], p["q90"]["te"], yte)
    results["raw-quantile"] = {"coverage": cov, "mean_width_aed": wid, "calibrated": False}

    # 2) split-conformal (SHIPPED): symmetric band around q50, delta = (1-alpha) quantile
    #    of absolute residuals on the CALIBRATION set only.
    resid = np.abs(ycal - p["q50"]["cal"])
    k = int(np.ceil((len(resid) + 1) * (1 - ALPHA))) - 1
    delta = float(np.sort(resid)[min(k, len(resid) - 1)])
    cov, wid = coverage_width(p["q50"]["te"] - delta, p["q50"]["te"] + delta, yte)
    results["split-conformal"] = {"coverage": cov, "mean_width_aed": wid, "calibrated": True,
                                  "delta_log": delta, "shipped": True}

    # 3) CQR — conformalize the quantile band itself (Romano et al. 2019).
    #    Score = max(q10 - y, y - q90) on calibration; add its (1-alpha) quantile to the band.
    e = np.maximum(p["q10"]["cal"] - ycal, ycal - p["q90"]["cal"])
    k = int(np.ceil((len(e) + 1) * (1 - ALPHA))) - 1
    q_e = float(np.sort(e)[min(k, len(e) - 1)])
    cov, wid = coverage_width(p["q10"]["te"] - q_e, p["q90"]["te"] + q_e, yte)
    results["CQR"] = {"coverage": cov, "mean_width_aed": wid, "calibrated": True, "delta_log": q_e}

    # 4) naive ±25% around the point estimate — the rule-of-thumb baseline
    mid = np.expm1(p["q50"]["te"])
    lo, hi = np.log1p(mid * 0.75), np.log1p(mid * 1.25)
    cov, wid = coverage_width(lo, hi, yte)
    results["naive-pct-25"] = {"coverage": cov, "mean_width_aed": wid, "calibrated": False}

    report = {
        "target_coverage": TARGET_COVERAGE,
        "n_total": n, "n_train": len(tr), "n_calibration": len(cal), "n_test": len(te),
        "split": "60/20/20 train/calibration/test — every method scored on the SAME untouched test rows",
        "methods": results,
    }
    OUT.write_text(json.dumps(report, indent=2))

    print(f"\nUncertainty study — target coverage {TARGET_COVERAGE:.0%}, n_test={len(te)}\n")
    print(f"{'method':<18}{'coverage':>10}{'mean width':>14}   verdict")
    print("-" * 62)
    for name, r in sorted(results.items(), key=lambda kv: -kv[1]["coverage"]):
        gap = r["coverage"] - TARGET_COVERAGE
        verdict = "under-covers" if gap < -0.03 else ("over-wide" if gap > 0.10 else "on target")
        star = "  <- shipped" if r.get("shipped") else ""
        print(f'{name:<18}{r["coverage"]:>9.1%}{r["mean_width_aed"]:>13,.0f}   {verdict}{star}')
    print(f"\n-> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
