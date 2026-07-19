"""Learning-curve measurement: does more DATA still buy accuracy, or are we
model-bound? This is the number that decides data-vs-features strategy.

WHY THIS WAS RE-RUN
-------------------
The original curve was measured on the pre-spec-join feature set (11 features) and reported an
asymptote near 10.4%, which the README quoted as "the pricing floor is data, not tuning". The
spec join has since shipped (`backend-api/models/spec_join.py` — +6 physical-spec features,
median APE 15.65% -> 13.18%), so that asymptote no longer describes the model the product runs.
A floor measured on a feature set nobody uses is not a floor.

This version measures BOTH curves — baseline (11 features) and shipped (17) — PAIRED on the same
seeds and the same held-out test rows, so the two asymptotes are directly comparable and their
difference is not split luck. At this corpus size split composition alone moves median APE by
~1pp, the same order as the effect being measured, so pairing is not optional.

WHAT THE TWO CURVES ANSWER
  * baseline asymptote — the floor of the OLD feature set (what the README used to quote).
  * shipped asymptote  — the floor of the SHIPPED feature set (what it should quote now).
  * the gap between them is what feature work bought that data alone never could.

Degrades honestly: with `data/raw/DriveArabia_All_uae.csv` absent (it is gitignored) only the
baseline curve is measured and the JSON records `spec_join_active: false`, rather than failing.

Run:  python eval/learning_curve.py             (writes eval/learning_curve.json)
      python eval/learning_curve.py --seeds 5   (quick)
"""
from __future__ import annotations

import argparse
import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from scipy.optimize import curve_fit
from sklearn.model_selection import train_test_split

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-api" / "models"))
from spec_join import SPEC_FEATURES, join, load_specs  # noqa: E402

CORPUS = ROOT / "data" / "processed" / "comparables.csv"
SPECS = ROOT / "data" / "raw" / "DriveArabia_All_uae.csv"
OUT = ROOT / "eval" / "learning_curve.json"

# Shipped training config — mirrored from backend-api/models/train_valuation.py so the curve
# describes the model the product actually publishes.
CATS = ["make", "model", "bodyType", "transmissionType", "fuelType", "regionalSpecs",
        "sellerType", "city"]
NUMS = ["age", "kilometers", "noOfCylinders"]
PARAMS = dict(n_estimators=400, max_depth=5, learning_rate=0.05, subsample=0.9,
              colsample_bytree=0.9, reg_lambda=1.0, random_state=42, n_jobs=4,
              objective="reg:squarederror")

TEST_N = 150  # held-out test kept CONSTANT so sizes are comparable to each other


def mono_for(feats: list[str]) -> str:
    """Monotone constraints in the SAME order as feats — age and kilometers depress price.
    A mismatch here silently constrains the wrong column, which is how B4 shipped a model
    that raised price with mileage while every constraint still *looked* correct."""
    return "(" + ",".join("-1" if f in ("age", "kilometers") else "0" for f in feats) + ")"


def load_corpus() -> pd.DataFrame:
    df = pd.read_csv(CORPUS)
    df = df[(df["price"] > 1000) & (df["price"] < 2_000_000)].copy()
    df["age"] = 2026 - pd.to_numeric(df["year"], errors="coerce")
    for c in CATS:
        df[c] = df[c].astype(str).str.strip().str.lower().fillna("unknown")
    for c in NUMS:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df[NUMS] = df[NUMS].fillna(df[NUMS].median())
    df["log_price"] = np.log1p(df["price"])
    return df.dropna(subset=["log_price"]).reset_index(drop=True)


def measure(enc: pd.DataFrame, feats: list[str], sizes: list[int], seeds: int) -> list[dict]:
    """Median APE at each train size, averaged over seeds. For a given seed the split is
    identical across feature sets, so two calls to this are paired."""
    params = dict(PARAMS, monotone_constraints=mono_for(feats))
    out = []
    for n in sizes:
        apes, maes = [], []
        for s in range(seeds):
            tr_pool, te = train_test_split(enc, test_size=TEST_N, random_state=s)
            if len(tr_pool) < n:
                continue
            tr = tr_pool.sample(n=n, random_state=s)
            m = xgb.XGBRegressor(**params).fit(tr[feats], tr["log_price"], verbose=False)
            pred = np.expm1(m.predict(te[feats]))
            true = te["price"].to_numpy()
            apes.append(float(np.median(np.abs(pred - true) / true) * 100))
            maes.append(float(np.mean(np.abs(pred - true))))
        if apes:
            out.append(dict(n=n, median_ape_pct=round(float(np.mean(apes)), 2),
                            std=round(float(np.std(apes)), 2),
                            mae_aed=round(float(np.mean(maes)), 0)))
    return out


def _rows_needed(a: float, b: float, c: float) -> dict:
    out = {}
    for target in (14, 13, 12, 11, 10, 9, 8):
        out[f"{target}pct"] = ("unreachable" if target <= c
                               else int(np.power((target - c) / a, -1.0 / b)))
    return out


def fit_curve(rows: list[dict]) -> dict | None:
    """APE(n) = a * n^-b + c — the classic learning curve. `c` is the asymptote: the accuracy
    no amount of additional data reaches with this feature set."""
    ns = np.array([r["n"] for r in rows], float)
    ys = np.array([r["median_ape_pct"] for r in rows], float)
    try:
        (a, b, c), _ = curve_fit(lambda n, a, b, c: a * np.power(n, -b) + c, ns, ys,
                                 p0=[100, 0.3, 8], maxfev=200000,
                                 bounds=([0, 0.01, 0], [1e6, 2.0, 30]))
    except Exception as e:  # a failed fit must not masquerade as an asymptote of 0
        print("  curve fit FAILED:", e)
        return None

    # A fit that lands ON the c=0 bound has not found an asymptote — it has degenerated to a
    # pure power law, which claims infinite data reaches 0% error. That is not a floor, and
    # reporting it as one would be worse than reporting nothing. Flag it instead of publishing.
    if c < 0.05:
        print(f"  curve fit DEGENERATE: asymptote collapsed to the c=0 bound (c={c:.4f}) — the "
              f"points do not constrain a floor. Reported as null, not as 0%.")
        return dict(a=round(float(a), 2), b=round(float(b), 4), asymptote_pct=None,
                    degenerate=True,
                    note="fit hit the c=0 lower bound; no asymptote is identifiable from these "
                         "points, so no floor is claimed")

    def f(n):
        return a * np.power(n, -b) + c
    return dict(a=round(float(a), 2), b=round(float(b), 4), asymptote_pct=round(float(c), 2),
                degenerate=False,
                marginal_pp_per_1000_rows_at_1300=round(float(f(1300) - f(2300)), 3),
                marginal_pp_per_1000_rows_at_5000=round(float(f(5000) - f(6000)), 3),
                rows_needed=_rows_needed(a, b, c))


def report(name: str, rows: list[dict], fit: dict | None) -> None:
    print(f"\n=== {name} ===")
    print(f"{'train_n':>8} {'median APE %':>14} {'±sd':>7} {'MAE AED':>10}")
    for r in rows:
        print(f"{r['n']:>8} {r['median_ape_pct']:>14.2f} {r['std']:>7.2f} {r['mae_aed']:>10,.0f}")
    if not fit:
        return
    if fit.get("degenerate"):
        print(f"  fit: APE(n) ~ {fit['a']} * n^-{fit['b']} — no identifiable asymptote")
        return
    print(f"  fit: APE(n) = {fit['a']} * n^-{fit['b']} + {fit['asymptote_pct']}"
          f"   (asymptote {fit['asymptote_pct']}%)")
    print(f"  marginal gain per +1000 rows: "
          f"{fit['marginal_pp_per_1000_rows_at_1300']:.2f}pp at n=1300, "
          f"{fit['marginal_pp_per_1000_rows_at_5000']:.2f}pp at n=5000")
    reach = ", ".join(f"{k}={v}" for k, v in fit["rows_needed"].items())
    print(f"  rows needed: {reach}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=25)
    args = ap.parse_args()

    df = load_corpus()
    print(f"usable rows: {len(df)}")

    # Sizes must leave TEST_N rows held out, so cap at len(df) - TEST_N. The list extends past
    # today's corpus on purpose: as the weekly scrape grows it, larger sizes light up by
    # themselves and the measured range widens instead of the script needing an edit.
    cap = len(df) - TEST_N
    sizes = [n for n in (200, 300, 400, 600, 800, 1000, 1150, 1400, 1800, 2400, 3200) if n <= cap]
    print(f"train sizes: {sizes}  (test held constant at {TEST_N})")

    spec_active = SPECS.exists()
    if spec_active:
        df, match_rate = join(df, load_specs(SPECS))
        df[SPEC_FEATURES] = df[SPEC_FEATURES].astype(float)
        print(f"spec join: ON — {match_rate:.1%} match rate")
    else:
        match_rate = None
        print(f"spec join: OFF — {SPECS} not found (baseline curve only)")

    # Ordinal-encode categoricals on the FULL corpus (matches training's global maps). Both
    # feature sets read from this one frame, so a given seed's split is identical across them.
    enc = df.copy()
    for c in CATS:
        enc[c] = enc[c].astype("category").cat.codes

    base_feats = NUMS + CATS
    base_rows = measure(enc, base_feats, sizes, args.seeds)
    base_fit = fit_curve(base_rows)
    report(f"BASELINE — {len(base_feats)} features (pre-spec-join)", base_rows, base_fit)

    spec_feats = NUMS + SPEC_FEATURES + CATS
    spec_rows = spec_fit = None
    if spec_active:
        spec_rows = measure(enc, spec_feats, sizes, args.seeds)
        spec_fit = fit_curve(spec_rows)
        report(f"SHIPPED — {len(spec_feats)} features (spec join)", spec_rows, spec_fit)
        if base_fit and spec_fit and not base_fit.get("degenerate") \
                and not spec_fit.get("degenerate"):
            gap = base_fit["asymptote_pct"] - spec_fit["asymptote_pct"]
            print(f"\nasymptote {base_fit['asymptote_pct']}% -> {spec_fit['asymptote_pct']}%"
                  f"  ({gap:+.2f}pp — bought by features, not rows)")
        else:
            print("\nasymptote comparison skipped — at least one fit is degenerate. Compare the "
                  "measured points above directly instead.")

    OUT.write_text(json.dumps({
        "what": "median APE vs training-set size for the pre- and post-spec-join feature sets, "
                "paired on identical seeds and identical held-out test rows",
        "usable_rows": int(len(df)),
        "test_n_held_constant": TEST_N,
        "seeds": args.seeds,
        "spec_join_active": spec_active,
        "spec_match_rate": match_rate,
        "baseline": {"n_features": len(base_feats), "curve": base_rows, "fit": base_fit},
        "shipped": (None if not spec_active else
                    {"n_features": len(spec_feats), "curve": spec_rows, "fit": spec_fit}),
        "honest_note": (
            "Extrapolations are a 3-parameter fit to a handful of points inside a narrow "
            "measured range — indicative, not a promise. The asymptote is the floor for THIS "
            "feature set: the spec join moved it, so more features can move it again. Re-run "
            "after the corpus grows or the feature set changes."
        ),
    }, indent=2) + "\n")
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
