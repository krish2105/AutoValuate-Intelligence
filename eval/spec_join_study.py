"""
Spec-join study — does joining vehicle specs onto the corpus actually improve pricing accuracy?

WHY THIS EXISTS
---------------
`data/raw/DriveArabia_All_uae.csv` (7,648 rows of UAE vehicle specifications) has been sitting in
the repo used by ZERO scripts. An analysis claimed joining it drops median APE from 15.65% to
12.89% — which would be the single largest accuracy win available, at zero cost and zero new
rows. That claim had NO committed artifact, so it was unusable: the project's own rule is that no
number enters a deck, the capstone, or a phase gate without a generator script and output JSON.

This script IS that generator. It is designed to be able to FAIL — if the join does not help, it
says so, and the claim dies here rather than in front of an examiner.

DESIGN (three guards against fooling ourselves)
  1. PAIRED. Baseline and treatment are scored on the SAME seeds and the SAME folds, so the
     comparison is not confounded by split luck. At this corpus size fold composition alone moves
     median APE by ~1pp, which is the same order as the effect being measured.
  2. BOOTSTRAP CI on the paired per-seed deltas. A point estimate at n=1,302 is noise.
  3. PERMUTATION CONTROL. The same specs are shuffled ACROSS nameplates and re-run. A real signal
     must vanish under permutation; if the shuffled version "helps" too, the gain was capacity or
     leakage, not information.

LEAKAGE
  The spec table contains `Approx Cost` — a PRICE column. Joining it onto a price-prediction task
  is target leakage and would manufacture a spectacular, meaningless result. It is excluded, and
  the exclusion is ASSERTED at runtime rather than trusted.

Run:  python eval/spec_join_study.py            (writes eval/spec_join_study.json)
      python eval/spec_join_study.py --seeds 3  (quick)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import KFold

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-api" / "models"))
from brand_tier import make_key  # noqa: E402  (canonical make normaliser)

CORPUS = ROOT / "data" / "processed" / "comparables.csv"
SPECS = ROOT / "data" / "raw" / "DriveArabia_All_uae.csv"
OUT = ROOT / "eval" / "spec_join_study.json"

# Shipped training config — mirrored from backend-api/models/train_valuation.py so the baseline
# this study reports is comparable to the number the product actually publishes.
CATS = ["make", "model", "bodyType", "transmissionType", "fuelType", "regionalSpecs",
        "sellerType", "city"]
NUMS = ["age", "kilometers", "noOfCylinders"]

# Physical specifications only. `Approx Cost` is deliberately absent (see LEAKAGE above), as is
# `Link`/`Overview` (free text/identifiers, not features).
SPEC_NUM = {
    "Power (hp)": "spec_hp",
    "Torque (Nm)": "spec_torque",
    "Fuel Econ (L/100km)": "spec_l100km",
    "Performance 0-100 kph (sec)": "spec_0to100",
    "Top speed (kph)": "spec_topspeed",
    "Weight": "spec_weight",
}
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


def load_specs() -> pd.DataFrame:
    s = pd.read_csv(SPECS)
    # Assert the leakage guard against the ACTUAL columns we are about to use.
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


def join(df: pd.DataFrame, specs: pd.DataFrame, permute_seed: int | None = None) -> tuple[pd.DataFrame, float]:
    """Left-join specs. permute_seed shuffles specs ACROSS nameplates (the negative control)."""
    d = df.copy()
    d["k_make"] = d["make"].map(make_key)
    d["k_model"] = d["model"].map(_norm_model)
    d["k_year"] = pd.to_numeric(d["year"], errors="coerce")

    sp = specs.copy()
    if permute_seed is not None:
        # Keep the join keys, shuffle the VALUES. Same coverage, same column count, no information.
        vals = sp[list(SPEC_NUM.values())].sample(frac=1.0, random_state=permute_seed).reset_index(drop=True)
        sp[list(SPEC_NUM.values())] = vals

    # Exact (make, model, year) first; fall back to nameplate median across years.
    m = d.merge(sp, on=["k_make", "k_model", "k_year"], how="left")
    nameplate = sp.groupby(["k_make", "k_model"], as_index=False).median(numeric_only=True).drop(columns=["k_year"])
    m = m.merge(nameplate, on=["k_make", "k_model"], how="left", suffixes=("", "_np"))
    for c in SPEC_NUM.values():
        m[c] = m[c].fillna(m[f"{c}_np"])
    m = m.drop(columns=[f"{c}_np" for c in SPEC_NUM.values()])
    match_rate = float(m[list(SPEC_NUM.values())].notna().any(axis=1).mean())
    return m, match_rate


def evaluate(df: pd.DataFrame, feats: list[str], seeds: int, folds: int = 5) -> list[float]:
    """Median APE per seed (averaged over folds). Same seeds => paired with any other call."""
    enc = df.copy()
    for c in CATS:
        if c in feats:
            enc[c] = enc[c].astype("category").cat.codes
    mono = "(" + ",".join("-1" if f in ("age", "kilometers") else "0" for f in feats) + ")"
    params = dict(n_estimators=400, max_depth=5, learning_rate=0.05, subsample=0.9,
                  colsample_bytree=0.9, reg_lambda=1.0, n_jobs=4, random_state=42,
                  objective="reg:squarederror", monotone_constraints=mono)
    X, y, price = enc[feats], enc["log_price"].to_numpy(), enc["price"].to_numpy()
    per_seed = []
    for s in range(seeds):
        apes = []
        for tr, te in KFold(n_splits=folds, shuffle=True, random_state=s).split(X):
            m = xgb.XGBRegressor(**params).fit(X.iloc[tr], y[tr], verbose=False)
            pred = np.expm1(m.predict(X.iloc[te]))
            apes.append(np.abs(pred - price[te]) / price[te])
        per_seed.append(float(np.median(np.concatenate(apes)) * 100))
    return per_seed


def boot_ci(deltas: list[float], n: int = 10000, seed: int = 0) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    a = np.asarray(deltas, float)
    means = rng.choice(a, size=(n, a.size), replace=True).mean(axis=1)
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=5)
    args = ap.parse_args()

    df = load_corpus()
    specs = load_specs()
    print(f"corpus {len(df)} rows | spec table {len(specs)} nameplate-years")

    joined, match = join(df, specs)
    print(f"spec match rate: {match:.1%} of corpus rows got at least one spec\n")

    base_feats = NUMS + CATS
    spec_feats = base_feats + list(SPEC_NUM.values())

    print(f"running {args.seeds} seeds x 5 folds, paired ...")
    base = evaluate(joined, base_feats, args.seeds)
    treat = evaluate(joined, spec_feats, args.seeds)
    perm_joined, _ = join(df, specs, permute_seed=7)
    perm = evaluate(perm_joined, spec_feats, args.seeds)

    d_real = [b - t for b, t in zip(base, treat)]     # positive = spec join HELPS
    d_perm = [b - p for b, p in zip(base, perm)]
    lo, hi = boot_ci(d_real)
    plo, phi = boot_ci(d_perm)

    print(f"\n{'':22}{'median APE %':>14}{'sd':>8}")
    print(f"{'baseline':22}{np.mean(base):>14.2f}{np.std(base):>8.2f}")
    print(f"{'+ specs':22}{np.mean(treat):>14.2f}{np.std(treat):>8.2f}")
    print(f"{'+ specs (permuted)':22}{np.mean(perm):>14.2f}{np.std(perm):>8.2f}")
    print(f"\nreal delta   {np.mean(d_real):+.2f} pp  95% CI [{lo:+.2f}, {hi:+.2f}]  "
          f"won {sum(x > 0 for x in d_real)}/{len(d_real)} seeds")
    print(f"permuted     {np.mean(d_perm):+.2f} pp  95% CI [{plo:+.2f}, {phi:+.2f}]")

    real_sig = lo > 0
    perm_sig = plo > 0
    verdict = ("ADOPT — real gain, control clean" if real_sig and not perm_sig else
               "REJECT — permuted control also gains; effect is capacity/leakage, not information"
               if real_sig and perm_sig else
               "REJECT — gain not distinguishable from zero")
    print(f"\nVERDICT: {verdict}")

    OUT.write_text(json.dumps({
        "corpus_rows": len(df),
        "spec_nameplate_years": len(specs),
        "spec_match_rate": round(match, 4),
        "seeds": args.seeds, "folds": 5,
        "spec_features": list(SPEC_NUM.values()),
        "excluded_for_leakage": ["Approx Cost"],
        "baseline_median_ape_per_seed": [round(x, 4) for x in base],
        "spec_median_ape_per_seed": [round(x, 4) for x in treat],
        "permuted_median_ape_per_seed": [round(x, 4) for x in perm],
        "baseline_mean": round(float(np.mean(base)), 4),
        "spec_mean": round(float(np.mean(treat)), 4),
        "permuted_mean": round(float(np.mean(perm)), 4),
        "delta_pp_mean": round(float(np.mean(d_real)), 4),
        "delta_pp_ci95": [round(lo, 4), round(hi, 4)],
        "permuted_delta_pp_mean": round(float(np.mean(d_perm)), 4),
        "permuted_delta_pp_ci95": [round(plo, 4), round(phi, 4)],
        "seeds_won": int(sum(x > 0 for x in d_real)),
        "verdict": verdict,
        "gate": "adopt only if the real CI excludes zero AND the permuted CI does not",
    }, indent=2) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
