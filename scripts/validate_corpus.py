"""
Data-validation gate for the comparables corpus (master plan WS 0.5).

Runs in the Phase-E scrape workflow between "scrape" and "commit" so a bad scrape —
schema drift from the Apify actor, absurd prices, duplicate ids, a truncated file —
can never merge into the corpus the retriever and valuation evals stand on.

Schema (types, ranges, uniqueness, required columns) is delegated to a formal pandera
schema in corpus_schema.py (WS-A4) — this script layers business-logic checks pandera
doesn't naturally express (row-count-never-shrinks, log_price consistency, timestamp
parseability) on top, and prints one failure list either way.

Usage:  python scripts/validate_corpus.py [--min-rows 672]
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import pandas as pd

from corpus_schema import validate as schema_validate

CSV = Path("data/processed/comparables.csv")


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

    if len(df) < args.min_rows:
        errors.append(f"corpus shrank: {len(df)} rows < required minimum {args.min_rows}")

    errors.extend(schema_validate(df))

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
