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
import io
import math
import subprocess
import sys
from pathlib import Path

import pandas as pd

from corpus_schema import validate as schema_validate

CSV = Path("data/processed/comparables.csv")


def _committed_row_count() -> int | None:
    """Row count of the corpus as committed at HEAD, or None if it can't be read.

    Returning None (first run, shallow clone, not a git checkout) is not a failure — the
    caller falls back to the --min-rows floor rather than blocking a legitimate run.
    """
    try:
        blob = subprocess.run(["git", "show", f"HEAD:{CSV.as_posix()}"],
                              capture_output=True, text=True, check=True, timeout=30).stdout
        return len(pd.read_csv(io.StringIO(blob)))
    except Exception:
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    # The corpus is append-only, so the honest invariant is "never fewer than last commit".
    # A fixed 672 was set when the corpus WAS 672; at 1303 rows it silently permitted a 48%
    # loss — a truncated scrape would validate, get baked into the retrieval index, and be
    # committed with the message "grow comparables corpus to ...". The floor now tracks the
    # committed row count, and --min-rows is only the fallback when git history is absent.
    ap.add_argument("--min-rows", type=int, default=1290,
                    help="fallback floor when the committed row count can't be read")
    args = ap.parse_args()

    if not CSV.exists():
        print(f"FAIL: missing {CSV}", file=sys.stderr)
        return 1

    df = pd.read_csv(CSV)
    errors: list[str] = []

    committed = _committed_row_count()
    floor = committed if committed is not None else args.min_rows
    if len(df) < floor:
        src = "last commit" if committed is not None else "--min-rows fallback"
        errors.append(f"corpus shrank: {len(df)} rows < {floor} ({src}) — append-only violated")

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
