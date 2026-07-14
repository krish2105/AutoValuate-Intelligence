"""
Phase E — recurring corpus growth.

Scrapes fresh Dubizzle listings via Apify, deduplicates against the existing corpus by
listing_id, and appends. Corpus size is the single biggest lever on retrieval quality
(the comparables RAG can only be as good as what it has to retrieve), so this runs on a
schedule rather than as a one-off.

Design notes:
  * Make-filtered start URLs, not plain pagination — pagination returns near-duplicates,
    while per-make URLs give the diversity the retriever actually needs.
  * Append-only + dedupe by listing_id: we never rewrite history, so price snapshots
    accumulate and a depreciation-over-time signal becomes possible later.
  * No token -> exit cleanly. The workflow must be a no-op, never a red X, when the
    secret isn't configured.

Usage:  APIFY_TOKEN=... python scripts/scrape_comparables.py [--per-make 40]
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

ACTOR = "agenscrape~dubizzle-uae-scraper"      # '/' becomes '~' in the Apify REST path
BASE = "https://api.apify.com/v2"
CSV = Path("data/processed/comparables.csv")

# Diversity beats depth: a spread of makes retrieves better than 600 rows of one model.
MAKES = [
    "toyota", "nissan", "honda", "mitsubishi", "hyundai", "kia", "ford", "chevrolet",
    "bmw", "mercedes-benz", "audi", "lexus", "mazda", "volkswagen", "jeep", "land-rover",
]


def scrape_make(token: str, make: str, limit: int) -> list[dict]:
    url = f"{BASE}/acts/{ACTOR}/run-sync-get-dataset-items?token={token}"
    payload = {
        "startUrl": f"https://dubai.dubizzle.com/motors/used-cars/{make}/",
        "maxResults": limit,
    }
    r = requests.post(url, json=payload, timeout=600)
    r.raise_for_status()
    items = r.json()
    return items if isinstance(items, list) else []


def normalise(raw: dict, make_hint: str) -> dict | None:
    """Map an Apify item onto the corpus schema. Drop anything without an id or price."""
    lid = str(raw.get("id") or raw.get("listing_id") or "").strip()
    price = raw.get("price") or raw.get("price_aed")
    try:
        price = float(str(price).replace(",", "").replace("AED", "").strip())
    except (TypeError, ValueError):
        return None
    if not lid or not price or price <= 0:
        return None

    year = raw.get("year")
    kms = raw.get("kilometers") or raw.get("mileage")
    try:
        year = int(year)
        kms = float(str(kms).replace(",", "").replace("km", "").strip())
    except (TypeError, ValueError):
        return None

    now = datetime.now(timezone.utc)
    age = max(0, now.year - year)
    return {
        "listing_id": lid,
        "title": raw.get("title", ""),
        "url": raw.get("url", ""),
        "createdAt": raw.get("createdAt", now.isoformat()),
        "neighbourhood": raw.get("neighbourhood", ""),
        "make": (raw.get("make") or make_hint).lower(),
        "model": (raw.get("model") or "").lower(),
        "year": year,
        "age": age,
        "kilometers": kms,
        "mileage_per_year": round(kms / max(age, 1), 2),
        "bodyType": raw.get("bodyType", ""),
        "noOfCylinders": raw.get("noOfCylinders") or raw.get("cylinders"),
        "horsepower": raw.get("horsepower"),
        "transmissionType": raw.get("transmissionType", ""),
        "fuelType": raw.get("fuelType", ""),
        "regionalSpecs": raw.get("regionalSpecs", ""),
        "exteriorColor": raw.get("exteriorColor", ""),
        "sellerType": raw.get("sellerType", ""),
        "city": raw.get("city", "Dubai"),
        "price": price,
        # log_price (the model's target) is filled in one vectorised pass by the caller
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-make", type=int, default=40)
    args = ap.parse_args()

    token = os.environ.get("APIFY_TOKEN", "").strip()
    if not token:
        print("APIFY_TOKEN not set — nothing to do (this is a no-op, not a failure).")
        return 0

    if not CSV.exists():
        print(f"missing corpus at {CSV}", file=sys.stderr)
        return 1

    existing = pd.read_csv(CSV)
    known = set(existing["listing_id"].astype(str))
    print(f"corpus: {len(existing)} rows, {len(known)} unique ids")

    fresh: list[dict] = []
    for make in MAKES:
        try:
            items = scrape_make(token, make, args.per_make)
        except Exception as e:  # one bad make must never sink the whole run
            print(f"  {make}: scrape failed ({type(e).__name__}) — skipping")
            continue
        added = 0
        for raw in items:
            row = normalise(raw, make)
            if row and row["listing_id"] not in known:
                known.add(row["listing_id"])
                fresh.append(row)
                added += 1
        print(f"  {make}: {len(items)} scraped, {added} new")
        time.sleep(1)  # be polite to the free tier

    if not fresh:
        print("no new listings — corpus unchanged.")
        return 0

    import numpy as np
    df = pd.DataFrame(fresh)
    df["log_price"] = np.log(df["price"])
    df["scraped_at"] = datetime.now(timezone.utc).isoformat()

    if "scraped_at" not in existing.columns:
        existing["scraped_at"] = ""

    out = pd.concat([existing, df], ignore_index=True)
    out = out.drop_duplicates(subset=["listing_id"], keep="first")
    out.to_csv(CSV, index=False)
    print(f"added {len(out) - len(existing)} new listings -> {len(out)} total")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
