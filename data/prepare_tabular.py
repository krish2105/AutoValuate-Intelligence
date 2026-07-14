"""
AutoValuate — tabular data preparation (Phase 1).

Cleans and feature-engineers the UAE used-car listings dataset
(alikalwar/uae-used-car-prices-and-features-10k-listings) into a modelling-ready
table for the XGBoost valuation model (Phase 4) and the comparables RAG index (Phase 5).

Reproducible: same input -> same output. No randomness. No synthetic rows.
Run:  python data/prepare_tabular.py
Reads:  data/raw/alt/uae_used_cars_10k.csv
Writes: data/processed/listings_clean.parquet   (modelling table)
        data/processed/comparables.csv           (RAG-facing, human-readable)
        data/processed/prep_report.json          (row counts, dropped, schema)
"""
from __future__ import annotations
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

# Reference year for vehicle age. The listings snapshot is from Feb 2025; we age
# against 2026 (project "current" year) so `age` reads correctly today.
REFERENCE_YEAR = 2026

RAW = Path("data/raw/alt/uae_used_cars_10k.csv")
OUT_DIR = Path("data/processed")

# Condition label -> (canonical name, ordinal severity 0..3, damage family).
# Parsed from the free-text Description "Condition: X" tag. This is the real signal
# that ties the CV damage detector's output back to a price adjustment.
CONDITION_MAP = {
    "no damage":         ("no_damage",        0, "none"),
    "minor scratches":   ("minor_scratches",  1, "cosmetic"),
    "repainted bumper":  ("repainted_bumper", 1, "cosmetic"),
    "dented door":       ("dented_door",      2, "panel"),
    "engine repaired":   ("engine_repaired",  3, "mechanical"),
    "accident history":  ("accident_history", 3, "structural"),
}

EMIRATE_CANON = {
    "dubai": "Dubai", "sharjah": "Sharjah", "abu dhabi": "Abu Dhabi",
    "ajman": "Ajman", "al ain": "Al Ain", "ras al khaimah": "Ras Al Khaimah",
    "umm al quwain": "Umm Al Quwain", "fujairah": "Fujairah",
}


def parse_condition(desc: str) -> str:
    m = re.search(r"Condition:\s*([^.\"]+)", str(desc))
    return m.group(1).strip().lower() if m else ""


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    report: dict = {"rows_in": int(len(df))}

    # --- normalise strings ---
    df["Make"] = df["Make"].str.strip().str.lower()
    df["Model"] = df["Model"].str.strip().str.lower()
    df["Location"] = (
        df["Location"].str.strip().str.lower().map(EMIRATE_CANON).fillna("Other")
    )
    df["Transmission"] = (
        df["Transmission"].str.replace(" Transmission", "", regex=False).str.strip()
    )
    df["Fuel Type"] = df["Fuel Type"].str.strip()
    df["Body Type"] = df["Body Type"].str.strip()
    df["Color"] = df["Color"].str.strip().str.lower()

    # Cylinders: coerce to numeric, keep NaN as a real "unknown" category later
    df["Cylinders"] = pd.to_numeric(df["Cylinders"], errors="coerce")

    # --- condition from free text ---
    cond_raw = df["Description"].map(parse_condition)
    df["condition"] = cond_raw.map(lambda c: CONDITION_MAP.get(c, ("unknown", 1, "unknown"))[0])
    df["condition_severity"] = cond_raw.map(lambda c: CONDITION_MAP.get(c, ("unknown", 1, "unknown"))[1])
    df["damage_family"] = cond_raw.map(lambda c: CONDITION_MAP.get(c, ("unknown", 1, "unknown"))[2])

    # --- engineered numerics ---
    df["age"] = REFERENCE_YEAR - df["Year"]
    df["mileage_per_year"] = (df["Mileage"] / df["age"].clip(lower=1)).round(0)
    df["log_price"] = np.log1p(df["Price"])  # heavy right skew -> log target

    # --- sanity filters (documented, not silent) ---
    before = len(df)
    df = df[(df["Year"] >= 2000) & (df["Year"] <= REFERENCE_YEAR)]
    df = df[(df["Price"] >= 5_000) & (df["Price"] <= 5_000_000)]  # drop absurd luxury/typo tails
    df = df[(df["Mileage"] >= 1_000) & (df["Mileage"] <= 400_000)]
    df = df[df["age"] >= 0]
    report["rows_dropped_sanity"] = int(before - len(df))

    df = df.drop_duplicates().reset_index(drop=True)
    report["rows_out"] = int(len(df))
    report["price_median_aed"] = float(df["Price"].median())
    report["mileage_median_km"] = float(df["Mileage"].median())
    report["condition_counts"] = df["condition"].value_counts().to_dict()
    report["make_count"] = int(df["Make"].nunique())
    report["model_count"] = int(df["Model"].nunique())
    report["reference_year"] = REFERENCE_YEAR
    return df, report


def main() -> None:
    if not RAW.exists():
        raise SystemExit(f"Missing {RAW}. Download it first (see data/README.md).")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(RAW)
    clean_df, report = clean(df)

    # Modelling table (features the XGBoost model consumes + target)
    model_cols = [
        "Make", "Model", "Year", "age", "Mileage", "mileage_per_year",
        "Body Type", "Cylinders", "Transmission", "Fuel Type", "Color",
        "Location", "condition", "condition_severity", "damage_family",
        "Price", "log_price",
    ]
    clean_df[model_cols].to_parquet(OUT_DIR / "listings_clean.parquet", index=False)

    # Comparables table (what the RAG layer indexes + shows the user) with a stable id
    comp = clean_df[model_cols].copy()
    comp.insert(0, "listing_id", [f"UAE-{i:05d}" for i in range(len(comp))])
    comp.to_csv(OUT_DIR / "comparables.csv", index=False)

    (OUT_DIR / "prep_report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    print(f"\nWrote:\n  {OUT_DIR/'listings_clean.parquet'}\n  {OUT_DIR/'comparables.csv'}\n  {OUT_DIR/'prep_report.json'}")


if __name__ == "__main__":
    main()
