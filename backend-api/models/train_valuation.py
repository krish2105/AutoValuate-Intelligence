"""
AutoValuate — valuation model training (rebuilds `valuation_model.joblib`).

Runs from the **committed** corpus (`data/processed/comparables.csv`), so a fresh clone can
reproduce the shipped artifact. The previous pipeline trained from
`data/processed/listings_clean.parquet`, which `.gitignore` excludes — the artifact could
not be rebuilt from the repo at all.

What this ships, and why (measured in `eval/model_improvement_study.py`, RESEARCH.md B3/B4):

  * **Mid = `reg:squarederror` + monotone constraints**, not `reg:quantileerror`.
    B4 proved xgboost's quantile objective silently ignores `monotone_constraints`, leaving
    the shipped model raising price on 100% of mileage sweeps (up to +27%). Squared error
    honors them exactly — and is more accurate here.
  * **`mileage_per_year` is dropped** (B3 ablation). It is km/age-derived, so sweeping age
    lowered it — a *positive* signal — and shoved price back up on 95% of age sweeps even
    when constrained. Removing it costs nothing (MAPE improves) and takes age violations to
    zero. It did not earn its place.
  * **Only the q50 head is kept.** q10/q90 were in the bundle but never read at inference:
    `valuation_model.predict()` builds its band from q50 ± the conformal delta, and D3 showed
    the band — not the quantile heads — carries the coverage promise.
  * **Mondrian (per-brand-tier) conformal.** A single global delta covers luxury cars only
    75.4% of the time vs the 80% promise; per-tier calibration lifts that to 78.2% (at ~12%
    wider luxury bands). Measured over 20 seeds — see the seed note below.

Target is `log1p(price)`, inverted with `expm1` — exact inverses. (The CSV's own `log_price`
column is `ln(price)`; pairing that with `expm1` under-predicts every car by 1 AED.)

**Seeds are not a formality here.** On 672 rows a 20%-test coverage estimate carries a ~5pp
standard deviation, so a single split is noise, not a measurement: RESEARCH.md B5's original
"luxury covers only 43.6%" came from one split and does not replicate (20-seed mean: 75-79%).
Coverage is therefore averaged over N_CONF_SEEDS splits, and CV over N_CV_SEEDS x 5 folds.

Pinned-version critical: train with the xgboost in `backend-api/requirements.txt` (2.1.3).
Artifacts trained on a newer xgboost may not load on the version Render actually runs, and
the bundle records the training version so a mismatch is visible rather than mysterious.

Usage:  python backend-api/models/train_valuation.py [--dry-run]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import KFold, train_test_split

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / "data" / "processed" / "comparables.csv"
BUNDLE = Path(__file__).with_name("valuation_model.joblib")
METRICS = ROOT / "eval" / "valuation_metrics.json"
SHAP = ROOT / "eval" / "shap_report.json"

SEED = 42
REFERENCE_YEAR = 2026
N_CV_SEEDS = 5    # x5 folds = 25 fits; fold composition alone moves MAPE ~1pp on 672 rows
N_CONF_SEEDS = 20  # coverage has ~5pp per-split std here — 5 seeds is not enough to see 3pp
# E1 reliability diagram: nominal coverage levels to promise, then measure honestly.
CALIBRATION_LEVELS = (0.50, 0.60, 0.70, 0.80, 0.90, 0.95)
# E5 "too good to be true": flag a listing cheaper than this share of genuine comparable cars.
# 2.5% is a deliberate trade — ~1 false flag per 8 valuations at 5 comparables each. The copy
# says "worth verifying", never "fraud", because 1-in-40 honest sellers will trip it.
ANOMALY_PCTILE = 0.025
# E7 beeswarm: cars sampled for the per-point SHAP swarm. 120 keeps the JSON ~65 KB and the
# chart legible; the full 671 would be a smear of overlapping dots for no extra insight.
BEESWARM_SAMPLES = 120
# Only the features that actually move price get a swarm row; below this the rows are flat.
BEESWARM_FEATURES = 8

CATS = ["make", "model", "bodyType", "transmissionType", "fuelType", "regionalSpecs",
        "sellerType", "city"]
NUMS = ["age", "kilometers", "noOfCylinders"]  # B3: mileage_per_year dropped
FEATURES = CATS + NUMS
# Price must never rise as a car ages or accrues kilometers. Order mirrors FEATURES.
MONOTONE = tuple([0] * len(CATS) + [-1 if n in ("age", "kilometers") else 0 for n in NUMS])

PARAMS = dict(n_estimators=400, max_depth=5, learning_rate=0.05, subsample=0.9,
              colsample_bytree=0.9, random_state=SEED, n_jobs=-1,
              objective="reg:squarederror", monotone_constraints=MONOTONE)

# Brand tiers for the B5 per-segment coverage diagnostic (RESEARCH.md B5).
LUXURY = {"mercedes-benz", "bmw", "audi", "lexus", "porsche", "land-rover", "jaguar",
          "maserati", "bentley", "rolls-royce", "cadillac", "infiniti", "tesla", "gmc"}


def load() -> pd.DataFrame:
    df = pd.read_csv(CSV)
    df = df[(df["price"] > 1000) & (df["price"] < 2_000_000)].copy()
    df["age"] = (REFERENCE_YEAR - df["year"]).clip(lower=0)
    # Derived from price, not read from the CSV column: log1p pairs exactly with expm1.
    df["log_price"] = np.log1p(df["price"])
    for c in CATS:
        df[c] = df[c].astype(str).str.strip().str.lower()
    for c in NUMS:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["brand_tier"] = np.where(df["make"].isin(LUXURY), "luxury", "mass")
    return df.dropna(subset=["log_price"]).reset_index(drop=True)


def encode(df: pd.DataFrame, maps: dict) -> pd.DataFrame:
    X = pd.DataFrame(index=df.index)
    for c in CATS:
        X[c] = df[c].map(maps[c]).fillna(-1).astype("int32")
    for n in NUMS:
        X[n] = df[n].astype("float32")
    return X[FEATURES]


def conformal_delta(resid: np.ndarray, alpha: float = 0.20) -> float:
    """Split-conformal: the ceil((n+1)(1-alpha))-th smallest absolute residual."""
    k = int(np.ceil((len(resid) + 1) * (1 - alpha))) - 1
    return float(np.sort(resid)[min(max(k, 0), len(resid) - 1)])


def check_monotone(model, df: pd.DataFrame, maps: dict) -> dict:
    """The guarantee this retrain exists to deliver: no price rise along a worsening sweep.

    Sweeps every held-out car over kilometers 20k->300k and age 1->15. Threshold 1e-4 in log
    space (~0.01%) sits above float32 jitter and far below anything a user could see.
    """
    out = {}
    for kind, grid in (("kilometers", np.linspace(20_000, 300_000, 15)),
                       ("age", np.arange(1, 16, dtype=float))):
        violated, max_rise = 0, 0.0
        for _, row in df.iterrows():
            v = pd.DataFrame([row] * len(grid))
            v[kind] = grid
            pred = model.predict(encode(v, maps)).astype(np.float64)
            worst = float(np.diff(pred).max()) if len(pred) > 1 else 0.0
            if worst > 1e-4:
                violated += 1
            max_rise = max(max_rise, worst)
        out[kind] = {"violation_rate": round(violated / len(df), 4),
                     "max_single_step_price_rise_pct": round(float(np.expm1(max_rise)) * 100, 2)}
    return out


def shap_report(model, X: pd.DataFrame) -> dict:
    """Global SHAP importance + directional sanity checks, derived from the shipped model.

    Generated here rather than in notebook 06 so it cannot drift from the artifact (and so it
    does not need the gitignored parquet). TreeSHAP via xgboost's own pred_contribs — same
    values as the shap library, without the heavy dependency.
    """
    sv = model.get_booster().predict(xgb.DMatrix(X), pred_contribs=True)[:, :-1]
    imp = {f: round(float(np.mean(np.abs(sv[:, j]))), 4) for j, f in enumerate(FEATURES)}
    checks = {}
    for feat in ("kilometers", "age"):
        j = FEATURES.index(feat)
        r = float(np.corrcoef(X[feat].to_numpy(), sv[:, j])[0, 1])
        checks[feat] = {"shap_corr": round(r, 3), "expected": "negative", "pass": bool(r < 0)}

    # E7 beeswarm: per-car SHAP for a deterministic subsample. A bar chart of mean |SHAP|
    # hides that a feature can push price hard in BOTH directions — the spread is the point.
    # `v` is the feature's own value, min-max normalised, so the swarm can be coloured by it
    # (high age = low price is the story a mean cannot tell).
    rng = np.random.default_rng(SEED)
    take = rng.choice(len(X), size=min(BEESWARM_SAMPLES, len(X)), replace=False)
    ranked = sorted(imp, key=lambda f: -imp[f])[:BEESWARM_FEATURES]  # the rest are flat lines
    beeswarm = {}
    for f in ranked:
        j = FEATURES.index(f)
        col = X[f].to_numpy()[take].astype(float)
        lo, hi = float(np.nanmin(col)), float(np.nanmax(col))
        span = hi - lo
        beeswarm[f] = [
            {"s": round(float(sv[i, j]), 3),
             "v": round(float((col[k] - lo) / span), 2) if span > 0 else 0.5}
            for k, i in enumerate(take)
        ]
    return {"global_importance": dict(sorted(imp.items(), key=lambda kv: -kv[1])),
            "directional_checks": checks,
            "beeswarm": {"n": int(len(take)), "order": ranked, "features": beeswarm}}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="measure but do not write the bundle")
    args = ap.parse_args()

    df = load()
    maps = {c: {v: i for i, v in enumerate(sorted(df[c].unique()))} for c in CATS}
    X = encode(df, maps)
    y = df["log_price"].to_numpy()
    price = df["price"].to_numpy()

    # --- repeated CV: N_SEEDS x 5 folds. One seed is not a measurement at this corpus size.
    fold = []
    for seed in range(N_CV_SEEDS):
        for tr, te in KFold(5, shuffle=True, random_state=seed).split(X):
            m = xgb.XGBRegressor(**PARAMS).fit(X.iloc[tr], y[tr], verbose=False)
            pred = np.expm1(m.predict(X.iloc[te]))
            true = price[te]
            ape = np.abs(pred - true) / true
            fold.append({"MAE_AED": float(np.mean(np.abs(pred - true))),
                         "RMSE_AED": float(np.sqrt(np.mean((pred - true) ** 2))),
                         "MAPE_pct": float(np.mean(ape) * 100),
                         "median_APE_pct": float(np.median(ape) * 100)})
    cv = pd.DataFrame(fold)
    cv_metrics = {k: {"mean": round(float(cv[k].mean()), 2), "std": round(float(cv[k].std()), 2)}
                  for k in cv.columns}

    # --- Mondrian conformal: one delta per brand tier, averaged over N_CONF_SEEDS splits.
    # A global delta is "80% on average" while covering luxury only ~75% — an average that
    # is wrong for an identifiable group of users. Per-tier calibration targets each group.
    idx = np.arange(len(X))
    tiers_all = df["brand_tier"].to_numpy()
    TIERS = ("luxury", "mass")
    d_global, d_tier = [], {t: [] for t in TIERS}
    cov_overall, cov_tier = [], {t: [] for t in TIERS}
    # E1 reliability diagram: promise N% coverage, measure what N% actually delivers. Free
    # here — same fits, just extra deltas — and it is the honesty claim made falsifiable.
    calib = {lvl: [] for lvl in CALIBRATION_LEVELS}
    # E5 anomaly flag: SIGNED held-out residuals per tier. Calling a listing "too good to be
    # true" is an accusation, so its threshold is an empirical quantile of what honest cars
    # actually do — not a normal approximation (these residuals have kurtosis ~5.2, so a
    # normal would under-count the very tail the flag lives in).
    signed_resid = {t: [] for t in TIERS}
    for seed in range(N_CONF_SEEDS):
        tr_i, tmp_i = train_test_split(idx, test_size=0.40, random_state=seed)
        cal_i, te_i = train_test_split(tmp_i, test_size=0.50, random_state=seed)
        m = xgb.XGBRegressor(**PARAMS).fit(X.iloc[tr_i], y[tr_i], verbose=False)
        resid = np.abs(y[cal_i] - m.predict(X.iloc[cal_i]))
        t_cal, t_te = tiers_all[cal_i], tiers_all[te_i]
        r_te_signed = y[te_i] - m.predict(X.iloc[te_i])
        for t in TIERS:
            signed_resid[t].append(r_te_signed[t_te == t])
        d_global.append(conformal_delta(resid))
        per_seed = {t: conformal_delta(resid[t_cal == t]) for t in TIERS}
        for t in TIERS:
            d_tier[t].append(per_seed[t])
        pred = m.predict(X.iloc[te_i])
        d_te = np.array([per_seed[t] for t in t_te])
        hit = (price[te_i] >= np.expm1(pred - d_te)) & (price[te_i] <= np.expm1(pred + d_te))
        cov_overall.append(float(np.mean(hit)))
        for t in TIERS:
            sel = t_te == t
            if sel.sum():
                cov_tier[t].append(float(np.mean(hit[sel])))
        abs_err = np.abs(y[te_i] - pred)
        for lvl in CALIBRATION_LEVELS:
            dt = {t: conformal_delta(resid[t_cal == t], alpha=1 - lvl) for t in TIERS}
            calib[lvl].append(float(np.mean(abs_err <= np.array([dt[t] for t in t_te]))))

    delta = float(np.mean(d_global))  # fallback for a make we have no tier for
    deltas_by_tier = {t: float(np.mean(v)) for t, v in d_tier.items()}
    coverage = float(np.mean(cov_overall))
    calibration_curve = [{"nominal": lvl,
                          "actual": round(float(np.mean(v)), 4),
                          "std": round(float(np.std(v)), 4)}
                         for lvl, v in calib.items()]
    # Mean |promised - delivered| across the curve: one number for "is the honesty real?".
    calibration_error = round(float(np.mean([abs(p["actual"] - p["nominal"])
                                             for p in calibration_curve])), 4)

    # The flag fires below this signed log-residual: by construction ANOMALY_PCTILE of genuine
    # listings trip it, so the false-positive rate is a measured property, not a guess.
    anomaly_floor = {t: round(float(np.quantile(np.concatenate(v), ANOMALY_PCTILE)), 4)
                     for t, v in signed_resid.items() if len(np.concatenate(v))}
    per_tier = {t: {"coverage": round(float(np.mean(v)), 3),
                    "std": round(float(np.std(v)), 3),
                    "n_splits": len(v)}
                for t, v in cov_tier.items() if v}

    # --- naive baseline (make/model median) for the "is the model earning its keep" number
    base = []
    for tr, te in KFold(5, shuffle=True, random_state=SEED).split(X):
        a, b = df.iloc[tr], df.iloc[te]
        mm = a.groupby(["make", "model"])["price"].median()
        mk = a.groupby("make")["price"].median()
        g = a["price"].median()
        p = b.apply(lambda r: mm.get((r["make"], r["model"]), mk.get(r["make"], g)), axis=1).values
        base.append(float(np.mean(np.abs(p - b["price"].values))))
    baseline = float(np.mean(base))

    # --- final fit on all rows + the monotonicity gate
    final = xgb.XGBRegressor(**PARAMS).fit(X, y, verbose=False)
    sweeps = check_monotone(final, df.sample(min(120, len(df)), random_state=SEED), maps)

    print(f"xgboost {xgb.__version__} | rows {len(df)} | features {FEATURES}")
    print(f"MAPE {cv_metrics['MAPE_pct']['mean']}±{cv_metrics['MAPE_pct']['std']}  "
          f"medAPE {cv_metrics['median_APE_pct']['mean']}±{cv_metrics['median_APE_pct']['std']}  "
          f"MAE {cv_metrics['MAE_AED']['mean']:,.0f} (baseline {baseline:,.0f})")
    print(f"mondrian deltas {({k: round(v, 4) for k, v in deltas_by_tier.items()})} "
          f"(global fallback {delta:.4f}) -> coverage {coverage:.3f} | per-tier {per_tier}")
    print(f"sweeps {sweeps}")
    print("calibration nominal->actual: "
          + "  ".join(f"{p['nominal']:.0%}->{p['actual']:.0%}" for p in calibration_curve)
          + f"  (mean |promised-delivered| {calibration_error:.3f})")

    shap = shap_report(final, X)
    print(f"shap directional checks: { {k: v['pass'] for k, v in shap['directional_checks'].items()} }")

    # The guarantee is the point of this config — refuse to ship an artifact without it.
    for kind, r in sweeps.items():
        assert r["violation_rate"] == 0.0, f"{kind} monotonicity violated: {r}"
    print("OK: zero monotonicity violations on kilometers and age")
    for feat, c in shap["directional_checks"].items():
        assert c["pass"], f"model learned the wrong direction for {feat}: {c}"
    print("OK: SHAP directional checks pass (age and kilometers depress price)")

    if args.dry_run:
        print("dry-run: bundle not written")
        return 0

    joblib.dump({
        "models": {"q50": final},
        "cat_maps": maps,
        "features": FEATURES,
        "categorical_features": CATS,
        "numeric_features": NUMS,
        "target": "log1p(price) (expm1 -> AED)",
        "quantiles": {"q50": 0.50},
        "cv_metrics": cv_metrics,
        "baseline_mae_aed": round(baseline, 2),
        "training_rows": int(len(df)),
        "dataset": f"Dubizzle UAE scrape July 2026 ({len(df)} real listings)",
        "reference_year": REFERENCE_YEAR,
        "conformal_delta_log": delta,  # fallback: a make in no known tier
        "conformal_delta_log_by_tier": deltas_by_tier,
        "brand_tier_luxury": sorted(LUXURY),  # bundle is self-contained: inference needs the tier
        "conformal_coverage": round(coverage, 3),
        "conformal_method": (f"Mondrian (per-brand-tier) split-conformal: 60/20/20 "
                             f"train/calibration/test, averaged over {N_CONF_SEEDS} seeds, "
                             f"coverage measured on held-out test"),
        "conformal_coverage_by_tier": per_tier,
        "anomaly_resid_floor_by_tier": anomaly_floor,  # E5: signed log-residual, per tier
        "anomaly_pctile": ANOMALY_PCTILE,
        "objective": "reg:squarederror with monotone_constraints(age=-1, kilometers=-1)",
        "monotone_verified": sweeps,
        "xgboost_version": xgb.__version__,  # must match backend-api/requirements.txt
    }, BUNDLE, compress=3)
    print(f"wrote {BUNDLE} ({BUNDLE.stat().st_size / 1e6:.1f} MB)")

    # Field names here are load-bearing: frontend/app/model/page.tsx reads this JSON directly
    # (synced by frontend/scripts/sync-eval.mjs). Add fields; do not rename them casually.
    METRICS.write_text(json.dumps({
        "model": "XGBoost reg:squarederror, monotone(age,kilometers), on log1p(price)",
        "cv": f"{N_CV_SEEDS} seeds x 5-fold shuffled — held-out folds only",
        "training_rows": int(len(df)),
        "features": FEATURES,
        "xgboost_version": xgb.__version__,
        "metrics": cv_metrics,
        "baseline_make_model_median_MAE_AED": round(baseline, 2),
        "improvement_over_baseline_pct": round(100 * (1 - cv_metrics["MAE_AED"]["mean"] / baseline), 1),
        "conformal": {"method": "Mondrian (per-brand-tier) split-conformal",
                      "delta_log_by_tier": {k: round(v, 4) for k, v in deltas_by_tier.items()},
                      "delta_log_global_fallback": round(delta, 4),
                      "honest_test_coverage": round(coverage, 3),
                      "coverage_by_tier": per_tier, "target": 0.80,
                      "seeds": N_CONF_SEEDS},
        "calibration_curve": calibration_curve,
        "calibration_error": calibration_error,
        "monotonicity": sweeps,
        "honest_note": (
            f"Median APE ~{cv_metrics['median_APE_pct']['mean']:.0f}% is the best this "
            f"{len(df)}-row corpus supports; the literature's ~8% floor assumes a corpus ~15x "
            "larger. Coverage carries a ~5pp per-split std at this size, so every coverage "
            f"number here is a mean over {N_CONF_SEEDS} seeds — single-split coverage claims "
            "are noise (see RESEARCH.md B5). Both numbers move mainly with data, not tuning."
        ),
    }, indent=2) + "\n")
    print(f"wrote {METRICS}")

    SHAP.write_text(json.dumps(shap, indent=2) + "\n")
    print(f"wrote {SHAP}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
