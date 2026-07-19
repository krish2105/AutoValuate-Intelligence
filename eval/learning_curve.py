"""Learning-curve measurement: does more DATA still buy accuracy, or are we
model-bound? This is the number that decides data-vs-features strategy.

Result at time of writing (25 seeds, constant 150-row held-out test):
  APE(n) = 162.6 * n^-0.486 + 10.36
  => +1,000 rows at n=1,300 buys ~1.21pp; at n=5,000 only ~0.22pp.
  => the curve asymptotes near 10.4% with the CURRENT feature set, so more data ALONE
     can never reach the ~8% figure quoted for larger markets. Beating ~10% requires new
     FEATURES (see eval/spec_join_study.py, which buys ~2.4pp with zero new rows).
Strategy this implies: sprint to ~5,000 rows, then pivot to feature work.

Replicates the shipped training config (train_valuation.PARAMS/CATS/NUMS) and measures
median APE at increasing corpus sizes, averaged over many seeds so the answer isn't noise.
"""
import sys, warnings
import numpy as np, pandas as pd, xgboost as xgb
from sklearn.model_selection import train_test_split
warnings.filterwarnings("ignore")
sys.path.insert(0, "backend-api/models")

CATS = ["make", "model", "bodyType", "transmissionType", "fuelType", "regionalSpecs",
        "sellerType", "city"]
NUMS = ["age", "kilometers", "noOfCylinders"]
MONOTONE = "(" + ",".join("-1" if c in ("age", "kilometers") else "0" for c in NUMS + CATS) + ")"
PARAMS = dict(n_estimators=400, max_depth=5, learning_rate=0.05, subsample=0.9,
              colsample_bytree=0.9, reg_lambda=1.0, random_state=42, n_jobs=4,
              objective="reg:squarederror", monotone_constraints=MONOTONE)

df = pd.read_csv("data/processed/comparables.csv")
df = df[(df["price"] > 1000) & (df["price"] < 2_000_000)].copy()
df["age"] = 2026 - pd.to_numeric(df["year"], errors="coerce")
for c in CATS:
    df[c] = df[c].astype(str).str.strip().str.lower().fillna("unknown")
for c in NUMS:
    df[c] = pd.to_numeric(df[c], errors="coerce")
df[NUMS] = df[NUMS].fillna(df[NUMS].median())
df["log_price"] = np.log1p(df["price"])
df = df.dropna(subset=["log_price"])
print(f"usable rows: {len(df)}")

# ordinal-encode categoricals on the FULL corpus (matches training's global maps)
enc = df.copy()
for c in CATS:
    enc[c] = enc[c].astype("category").cat.codes
FEATS = NUMS + CATS

SIZES = [200, 300, 400, 600, 800, 1000, 1150]
SEEDS = 25
TEST_N = 150  # held-out test kept CONSTANT so sizes are comparable

print(f"\n{'train_n':>8} {'median APE %':>14} {'±sd':>7} {'MAE AED':>10}")
rows = []
for n in SIZES:
    apes, maes = [], []
    for s in range(SEEDS):
        tr_pool, te = train_test_split(enc, test_size=TEST_N, random_state=s)
        if len(tr_pool) < n:
            continue
        tr = tr_pool.sample(n=n, random_state=s)
        m = xgb.XGBRegressor(**PARAMS).fit(tr[FEATS], tr["log_price"], verbose=False)
        pred = np.expm1(m.predict(te[FEATS]))
        true = te["price"].to_numpy()
        apes.append(float(np.median(np.abs(pred - true) / true) * 100))
        maes.append(float(np.mean(np.abs(pred - true))))
    if apes:
        rows.append((n, np.mean(apes), np.std(apes), np.mean(maes)))
        print(f"{n:>8} {np.mean(apes):>14.2f} {np.std(apes):>7.2f} {np.mean(maes):>10,.0f}")

# Fit median APE = a * n^(-b) + c  (classic learning curve) and extrapolate
from scipy.optimize import curve_fit
ns = np.array([r[0] for r in rows], float)
ys = np.array([r[1] for r in rows], float)
def f(n, a, b, c):
    return a * np.power(n, -b) + c
try:
    (a, b, c), _ = curve_fit(f, ns, ys, p0=[100, 0.3, 8], maxfev=200000,
                             bounds=([0, 0.01, 0], [1e6, 2.0, 30]))
    print(f"\nfit: APE(n) = {a:.1f} * n^-{b:.3f} + {c:.2f}   (asymptote {c:.2f}% as n->inf)")
    print("\nEXTRAPOLATION (treat as indicative, not promise):")
    for target in [14, 13, 12, 11, 10, 9]:
        if target <= c:
            print(f"  {target}% median APE: UNREACHABLE — curve asymptotes at {c:.2f}%")
            continue
        n_needed = np.power((target - c) / a, -1.0 / b)
        print(f"  {target}% median APE needs ~{n_needed:,.0f} rows"
              + ("  <-- beyond any free-tier horizon" if n_needed > 50000 else ""))
    print(f"\nmarginal gain per +1000 rows at n=1300: "
          f"{f(1300,a,b,c)-f(2300,a,b,c):.2f} pp")
    print(f"marginal gain per +1000 rows at n=5000: "
          f"{f(5000,a,b,c)-f(6000,a,b,c):.2f} pp")
except Exception as e:
    print("curve fit failed:", e)
