"""
Data-validation gate for the comparables corpus (master plan WS 0.5).

Runs in the Phase-E scrape workflow between "scrape" and "commit" so a bad scrape —
schema drift from the Apify actor, absurd prices, duplicate ids, a truncated file —
can never merge into the corpus the retriever and valuation evals stand on.

Deliberately stdlib + pandas only (no new CI deps). Every check prints what it saw;
any violation exits 1, which fails the workflow before the commit step.

Usage:  python scripts/validate_corpus.py [--min-rows 672]
"""
from __future__ import annotations

import argparse
import math
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

CSV = Path("data/processed/comparables.csv")

REQUIRED = [
    "listing_id", "title", "url", "make", "model", "year", "kilometers",
    "bodyType", "transmissionType", "fuelType", "regionalSpecs",
    "noOfCylinders", "city", "neighbourhood", "sellerType", "price",
]

# Sanity ranges for real UAE used-car listings.
PRICE_AED = (1_000, 5_000_000)
YEAR = (1980, datetime.now().year + 1)
KILOMETERS = (0, 1_500_000)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-rows", type=int, default=672,
                    help="corpus is append-only — it must never shrink below this")
    args = ap.parse_args()

    if not CSV.exists():
        print(f"FAIL: missing {CSV}", file=sys.stderr)
        return 1

    df = pd.read_csv(CSV)
    errors: list[str] = []

    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        errors.append(f"missing required columns: {missing}")

    if len(df) < args.min_rows:
        errors.append(f"corpus shrank: {len(df)} rows < required minimum {args.min_rows}")

    if "listing_id" in df.columns:
        ids = df["listing_id"].astype(str)
        if ids.isna().any() or (ids.str.strip() == "").any():
            errors.append("blank listing_id values")
        dupes = int(ids.duplicated().sum())
        if dupes:
            errors.append(f"{dupes} duplicate listing_id rows (corpus must dedupe on append)")

    def range_check(col: str, lo: float, hi: float) -> None:
        if col not in df.columns:
            return
        vals = pd.to_numeric(df[col], errors="coerce")
        bad = int(((vals < lo) | (vals > hi) | vals.isna()).sum())
        if bad:
            errors.append(f"{bad} rows with {col} outside [{lo}, {hi}] or non-numeric")

    range_check("price", *PRICE_AED)
    range_check("year", *YEAR)
    range_check("kilometers", *KILOMETERS)

    # log_price is the model target — it must actually be ln(price) where present.
    if {"log_price", "price"} <= set(df.columns):
        lp = pd.to_numeric(df["log_price"], errors="coerce")
        p = pd.to_numeric(df["price"], errors="coerce")
        drift = ((lp - p.map(lambda v: math.log(v) if v and v > 0 else float("nan"))).abs() > 0.01)
        bad = int(drift.fillna(False).sum())
        if bad:
            errors.append(f"{bad} rows where log_price != ln(price)")

    # scraped_at must be empty (pre-cron rows) or ISO-8601 parseable.
    if "scraped_at" in df.columns:
        ts = df["scraped_at"].fillna("").astype(str).str.strip()
        nonempty = ts[ts != ""]
        bad = int(pd.to_datetime(nonempty, errors="coerce", format="ISO8601").isna().sum())
        if bad:
            errors.append(f"{bad} rows with unparseable scraped_at timestamps")

    print(f"corpus: {len(df)} rows x {len(df.columns)} cols, "
          f"{df['make'].nunique() if 'make' in df.columns else '?'} makes")
    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print("OK: all validation gates passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
