"""
Formal pandera schema for the comparables corpus (master plan WS-A4).

This replaces the hand-rolled range/type checks in validate_corpus.py with a single
declarative schema: one place that says what a valid row looks like, reusable by any
script that touches data/processed/comparables.csv (scraper, index builder, evals).

pandera's lazy validation collects every violation in one pass instead of failing on
the first bad row, so a CI failure message shows the whole picture at once.
"""
from __future__ import annotations

from datetime import datetime

import pandera.pandas as pa
from pandera.pandas import Check, Column, DataFrameSchema

CURRENT_YEAR = datetime.now().year

CorpusSchema = DataFrameSchema(
    columns={
        "listing_id": Column(str, Check.str_length(min_value=1), unique=True, nullable=False),
        "title": Column(str, nullable=True, coerce=True),
        "url": Column(str, nullable=True, coerce=True),
        "make": Column(str, Check.str_length(min_value=1), nullable=False, coerce=True),
        "model": Column(str, nullable=True, coerce=True),
        "year": Column(int, Check.in_range(1980, CURRENT_YEAR + 1), nullable=False, coerce=True),
        "kilometers": Column(float, Check.in_range(0, 1_500_000), nullable=False, coerce=True),
        "bodyType": Column(str, nullable=True, coerce=True),
        "transmissionType": Column(str, nullable=True, coerce=True),
        "fuelType": Column(str, nullable=True, coerce=True),
        "regionalSpecs": Column(str, nullable=True, coerce=True),
        "noOfCylinders": Column(float, nullable=True, coerce=True, required=False),
        "city": Column(str, nullable=True, coerce=True),
        "neighbourhood": Column(str, nullable=True, coerce=True),
        "sellerType": Column(str, nullable=True, coerce=True),
        "price": Column(float, Check.in_range(1_000, 5_000_000), nullable=False, coerce=True),
    },
    strict=False,  # extra columns (photo_urls, scraped_at, log_price, age, ...) are fine
    coerce=True,
)


def validate(df) -> list[str]:
    """Run the schema and return a list of human-readable error strings (empty = valid)."""
    try:
        CorpusSchema.validate(df, lazy=True)
        return []
    except pa.errors.SchemaErrors as exc:
        cases = exc.failure_cases
        out: list[str] = []
        for _, row in cases.iterrows():
            col = row.get("column") or "<row-level>"
            check = row.get("check")
            failed = row.get("failure_case")
            out.append(f"{col}: check '{check}' failed on value {failed!r}")
        return out
