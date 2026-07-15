"""
B4/B5 — Valuation-model improvement studies (master plan workstream B).

Two experiments on the same 60/20/20 split discipline as uncertainty_study.py
(calibration and evaluation never share rows):

B4 — Monotonic constraints.
    A used car must not get MORE expensive as it ages or accrues kilometers, yet an
    unconstrained tree ensemble is free to violate that on thin data. We refit the same
    XGBoost quantile heads with monotone_constraints (age -1, kilometers -1, and
    mileage_per_year -1 — it is km-derived, so it must move with kilometers) and measure:
      * test MAPE, constrained vs unconstrained (accuracy must not degrade), and
      * sweep violations: for every test car, sweep kilometers 20k→300k and age 1→15
        (recomputing the derived mileage_per_year) and count cars whose predicted price
        ever RISES along the sweep.
    Note the age sweep is NOT guaranteed monotone even when constrained: raising age
    lowers mileage_per_year (a quality signal moving the other way). We report it rather
    than hide it — whether the data resolves that tension is exactly the question.

B5 — Mondrian (group-conditional) conformal.
    The shipped split-conformal interval promises 80% coverage OVERALL — it may still
    over-cover mass-market cars and under-cover luxury ones. We calibrate one delta per
    brand tier (Mondrian conformal) and compare per-group coverage and width against the
    single global delta. The known cost: smaller per-group calibration sets mean noisier,
    typically wider intervals.

Usage:  python eval/model_improvement_study.py  ->  eval/model_improvement_study.json
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb

ROOT = Path(__file__).resolve().parents[1]
CSV = ROOT / "data" / "processed" / "comparables.csv"
OUT = ROOT / "eval" / "model_improvement_study.json"

TARGET_COVERAGE = 0.80
ALPHA = 1 - TARGET_COVERAGE
SEED = 42
REFERENCE_YEAR = 2026

CATS = ["make", "model", "bodyType", "transmissionType", "fuelType", "regionalSpecs", "sellerType", "city"]
NUMS = ["age", "kilometers", "mileage_per_year", "noOfCylinders"]

LUXURY = {
    "mercedes-benz", "bmw", "audi", "lexus", "porsche", "land-rover", "jaguar",
    "maserati", "bentley", "rolls-royce", "cadillac", "infiniti", "tesla", "gmc",
}


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
    df["brand_tier"] = np.where(df["make"].isin(LUXURY), "luxury", "mass")
    return df.dropna(subset=["log_price"])


def encode(df: pd.DataFrame, maps: dict | None = None):
    maps = maps or {c: {v: i for i, v in enumerate(sorted(df[c].unique()))} for c in CATS}
    X = pd.DataFrame(index=df.index)
    for c in CATS:
        X[c] = df[c].map(maps[c]).fillna(-1).astype(int)
    for c in NUMS:
        X[c] = df[c].astype(float)
    return X, maps


def fit_quantiles(Xtr, ytr, monotone: bool):
    # Feature order is CATS + NUMS; constrain age/kilometers/mileage_per_year downward.
    cons = tuple([0] * len(CATS) + [-1, -1, -1, 0]) if monotone else None
    models = {}
    for name, q in (("q10", 0.10), ("q50", 0.50), ("q90", 0.90)):
        m = xgb.XGBRegressor(
            objective="reg:quantileerror", quantile_alpha=q,
            n_estimators=400, max_depth=5, learning_rate=0.05,
            subsample=0.9, colsample_bytree=0.9, random_state=SEED,
            **({"monotone_constraints": cons} if cons else {}),
        )
        m.fit(Xtr, ytr)
        models[name] = m
    return models


def mape(model, Xte, price_te) -> float:
    pred = np.expm1(model.predict(Xte))
    return float(np.mean(np.abs(pred - price_te) / price_te))


def sweep_violations(model, df_te: pd.DataFrame, maps: dict, kind: str) -> dict:
    """How often — and by how much — predicted price RISES along a worsening sweep.

    Violation threshold is 1e-4 in log space (~0.01% price): float32 prediction jitter
    sits below it, a violation a user could ever see sits far above it.
    """
    grids = {
        "kilometers": np.linspace(20_000, 300_000, 15),
        "age": np.arange(1, 16, dtype=float),
    }
    grid = grids[kind]
    violated, max_rise_log = 0, 0.0
    for _, row in df_te.iterrows():
        variants = pd.DataFrame([row] * len(grid))
        variants[kind] = grid
        # mileage_per_year is derived — keep it consistent with the swept feature.
        variants["mileage_per_year"] = variants["kilometers"] / variants["age"].clip(lower=1)
        Xv, _ = encode(variants, maps)
        pred = model.predict(Xv).astype(np.float64)
        rises = np.diff(pred)
        worst = float(rises.max()) if len(rises) else 0.0
        if worst > 1e-4:
            violated += 1
        max_rise_log = max(max_rise_log, worst)
    return {
        "violation_rate": violated / len(df_te),
        "max_single_step_price_rise_pct": float(np.expm1(max_rise_log)) * 100,
    }


def conformal_delta(resid: np.ndarray, alpha: float) -> float:
    k = int(np.ceil((len(resid) + 1) * (1 - alpha))) - 1
    return float(np.sort(resid)[min(max(k, 0), len(resid) - 1)])


def main() -> int:
    df = load()
    rng = np.random.default_rng(SEED)
    idx = rng.permutation(len(df))
    n = len(df)
    n_tr, n_cal = int(0.6 * n), int(0.2 * n)
    tr, cal, te = idx[:n_tr], idx[n_tr:n_tr + n_cal], idx[n_tr + n_cal:]

    Xall, maps = encode(df)
    y = df["log_price"].to_numpy()
    price = df["price"].to_numpy()

    Xtr, ytr = Xall.iloc[tr], y[tr]
    Xcal, ycal = Xall.iloc[cal], y[cal]
    Xte, yte = Xall.iloc[te], y[te]

    report: dict = {
        "n_total": n, "n_train": len(tr), "n_calibration": len(cal), "n_test": len(te),
        "split": "60/20/20 train/calibration/test, seed 42 — same discipline as uncertainty_study.py",
        "note": "MAPE here is study-internal (corpus features only); it is NOT comparable to the "
                "shipped model's published 19.6% MAPE, which was trained on the full cleaned dataset.",
    }

    # ── B4: monotonic constraints ────────────────────────────────────────────────
    b4 = {}
    df_te = df.iloc[te]
    for label, monotone in (("unconstrained", False), ("monotone-quantile", True)):
        models = fit_quantiles(Xtr, ytr, monotone)
        b4[label] = {
            "test_mape": mape(models["q50"], Xte, price[te]),
            "km_sweep": sweep_violations(models["q50"], df_te, maps, "kilometers"),
            "age_sweep": sweep_violations(models["q50"], df_te, maps, "age"),
        }

    # Third variant: a squared-error mid model. Discovered while measuring: XGBoost's
    # reg:quantileerror does NOT reliably honor monotone_constraints (its exact-quantile
    # leaf refresh bypasses the structural bounds — single-coordinate violations remain),
    # while reg:squarederror enforces them fully. Measure what that guarantee costs.
    cons = tuple([0] * len(CATS) + [-1, -1, -1, 0])
    sq = xgb.XGBRegressor(
        objective="reg:squarederror", n_estimators=400, max_depth=5, learning_rate=0.05,
        subsample=0.9, colsample_bytree=0.9, random_state=SEED, monotone_constraints=cons,
    )
    sq.fit(Xtr, ytr)
    b4["monotone-squarederror-mid"] = {
        "test_mape": mape(sq, Xte, price[te]),
        "km_sweep": sweep_violations(sq, df_te, maps, "kilometers"),
        "age_sweep": sweep_violations(sq, df_te, maps, "age"),
    }
    b4["finding"] = (
        "xgboost 3.2.0 reg:quantileerror violates monotone_constraints even on single "
        "coordinates (demonstrated: +2.9% price for +20k km on a constrained model); "
        "reg:squarederror honors them fully."
    )
    report["B4_monotonic_constraints"] = b4

    # ── B5: Mondrian conformal by brand tier ────────────────────────────────────
    models = fit_quantiles(Xtr, ytr, monotone=True)  # evaluate on the B4 winner's heads
    p_cal = models["q50"].predict(Xcal)
    p_te = models["q50"].predict(Xte)
    resid_cal = np.abs(ycal - p_cal)

    tier_cal = df.iloc[cal]["brand_tier"].to_numpy()
    tier_te = df.iloc[te]["brand_tier"].to_numpy()

    delta_global = conformal_delta(resid_cal, ALPHA)
    deltas_mondrian = {t: conformal_delta(resid_cal[tier_cal == t], ALPHA)
                       for t in np.unique(tier_cal)}

    b5: dict = {"global_delta_log": delta_global,
                "mondrian_delta_log": deltas_mondrian, "groups": {}}
    for t in np.unique(tier_te):
        m = tier_te == t
        yt, pt = yte[m], p_te[m]

        def cov_width(delta: float) -> tuple[float, float]:
            covered = float(((yt >= pt - delta) & (yt <= pt + delta)).mean())
            width = float((np.expm1(pt + delta) - np.expm1(pt - delta)).mean())
            return covered, width

        cg, wg = cov_width(delta_global)
        cm, wm = cov_width(deltas_mondrian[t])
        b5["groups"][t] = {
            "n_test": int(m.sum()), "n_calibration": int((tier_cal == t).sum()),
            "global": {"coverage": cg, "mean_width_aed": wg},
            "mondrian": {"coverage": cm, "mean_width_aed": wm},
        }
    report["B5_mondrian_conformal"] = b5

    OUT.write_text(json.dumps(report, indent=2))

    print("\nB4 — monotonic constraints (mid model)")
    print(f"{'model':<28}{'MAPE':>8}{'km viol.':>10}{'km max rise':>13}{'age viol.':>11}{'age max rise':>14}")
    for label, r in b4.items():
        if label == "finding":
            continue
        print(f"{label:<28}{r['test_mape']:>7.1%}{r['km_sweep']['violation_rate']:>9.1%}"
              f"{r['km_sweep']['max_single_step_price_rise_pct']:>12.2f}%"
              f"{r['age_sweep']['violation_rate']:>10.1%}"
              f"{r['age_sweep']['max_single_step_price_rise_pct']:>13.2f}%")

    print(f"\nB5 — Mondrian conformal by brand tier (target {TARGET_COVERAGE:.0%})")
    print(f"{'group':<9}{'n_te':>5}{'n_cal':>6} | {'global cov':>10}{'width':>10} | {'mondrian cov':>12}{'width':>10}")
    for t, g in b5["groups"].items():
        print(f"{t:<9}{g['n_test']:>5}{g['n_calibration']:>6} | {g['global']['coverage']:>9.1%}"
              f"{g['global']['mean_width_aed']:>10,.0f} | {g['mondrian']['coverage']:>11.1%}"
              f"{g['mondrian']['mean_width_aed']:>10,.0f}")
    print(f"\n-> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
