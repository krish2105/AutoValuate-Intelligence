"""
AutoValuate — tabular data preparation (Phase 1/4).

Cleans and feature-engineers REAL Dubizzle UAE used-car listings (scraped July 2026
via Apify `agenscrape/dubizzle-uae-scraper`; see DECISIONS.md ADR-011) into a
modelling-ready table for the XGBoost valuation model and the comparables RAG index.

Reproducible: same input -> same output. No randomness. No synthetic rows.
Run:  python data/prepare_tabular.py
Reads:  data/raw/dubizzle/dubizzle_listings.csv
Writes: data/processed/listings_clean.parquet   (modelling table)
        data/processed/comparables.csv           (RAG-facing, keeps listing URL)
        data/processed/prep_report.json          (row counts, dropped, schema)
"""
from __future__ import annotations
import json
from pathlib import Path

import numpy as np
import pandas as pd

REFERENCE_YEAR = 2026  # scrape date: July 2026

RAW = Path("data/raw/dubizzle/dubizzle_listings.csv")
OUT_DIR = Path("data/processed")

CANON_SPEC = {
    "gcc specs": "GCC", "american specs": "American", "european specs": "European",
    "japanese specs": "Japanese", "canadian specs": "Canadian", "korean specs": "Korean",
    "chinese specs": "Chinese", "other": "Other",
}


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    report: dict = {"rows_in": int(len(df))}

    df = df.drop_duplicates(subset="id").copy()
    report["rows_after_dedupe"] = int(len(df))

    # --- coerce numerics (scraper emits strings for some fields) ---
    for col in ["price", "kilometers", "year", "noOfCylinders", "horsepower"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # horsepower arrives as a band label sometimes; keep numeric only, NaN otherwise
    # --- normalise strings ---
    for col in ["make", "model", "bodyType", "transmissionType", "fuelType",
                "sellerType", "exteriorColor", "city", "neighbourhood", "motorsTrim"]:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip()
    df["make"] = df["make"].str.lower()
    df["model"] = df["model"].str.lower()
    df["transmissionType"] = df["transmissionType"].str.replace(" Transmission", "", regex=False)
    df["regionalSpecs"] = (
        df["regionalSpecs"].astype(str).str.strip().str.lower().map(CANON_SPEC).fillna("Other")
    )

    # --- sanity filters (documented, not silent) ---
    before = len(df)
    df = df[df["price"].between(3_000, 3_000_000)]          # drop AED 0 / typo tails
    df = df[df["year"].between(1990, REFERENCE_YEAR)]
    df = df[df["kilometers"].between(0, 500_000)]
    df = df.dropna(subset=["make", "model", "price", "year", "kilometers"])
    report["rows_dropped_sanity"] = int(before - len(df))

    # --- engineered numerics ---
    df["age"] = (REFERENCE_YEAR - df["year"]).clip(lower=0)
    df["mileage_per_year"] = (df["kilometers"] / df["age"].clip(lower=1)).round(0)
    df["log_price"] = np.log1p(df["price"])

    df = df.reset_index(drop=True)
    report["rows_out"] = int(len(df))
    report["price_median_aed"] = float(df["price"].median())
    report["mileage_median_km"] = float(df["kilometers"].median())
    report["year_range"] = [int(df["year"].min()), int(df["year"].max())]
    report["make_count"] = int(df["make"].nunique())
    report["model_count"] = int(df["model"].nunique())
    report["city_counts"] = df["city"].value_counts().to_dict()
    report["reference_year"] = REFERENCE_YEAR

    # real-data sanity: price must correlate sensibly with age/mileage
    report["corr_log_price"] = {
        "age": round(float(df["age"].corr(df["log_price"])), 3),
        "kilometers": round(float(df["kilometers"].corr(df["log_price"])), 3),
    }
    return df, report


def main() -> None:
    if not RAW.exists():
        raise SystemExit(f"Missing {RAW}. Run the Dubizzle scrape first (see DECISIONS.md ADR-011).")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(RAW)
    clean_df, report = clean(df)

    model_cols = [
        "make", "model", "year", "age", "kilometers", "mileage_per_year",
        "bodyType", "noOfCylinders", "horsepower", "transmissionType", "fuelType",
        "regionalSpecs", "exteriorColor", "sellerType", "city",
        "price", "log_price",
    ]
    clean_df[model_cols].to_parquet(OUT_DIR / "listings_clean.parquet", index=False)

    # Comparables table: keeps the real listing id/url/title for citation grounding
    comp_cols = ["id", "title", "url", "createdAt", "neighbourhood"] + model_cols
    comp = clean_df[[c for c in comp_cols if c in clean_df.columns]].copy()
    comp = comp.rename(columns={"id": "listing_id"})
    comp.to_csv(OUT_DIR / "comparables.csv", index=False)

    (OUT_DIR / "prep_report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    print(f"\nWrote:\n  {OUT_DIR/'listings_clean.parquet'}\n  {OUT_DIR/'comparables.csv'}\n  {OUT_DIR/'prep_report.json'}")


if __name__ == "__main__":
    main()
