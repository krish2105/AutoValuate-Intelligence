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
# Every sighting of every listing, append-only: (listing_id, scraped_at, price). The corpus
# dedupes by listing_id, which is right for retrieval but silently threw away the market's
# time dimension — a listing re-scraped at a lower price was dropped, so "price snapshots
# accumulate" was a design note the code never honoured. Time-on-market and price-drop
# analytics read THIS file; the corpus stays the retrieval view.
HISTORY = Path("data/processed/price_history.csv")

# Diversity beats depth: a spread of makes retrieves better than 600 rows of one model.
MAKES = [
    "toyota", "nissan", "honda", "mitsubishi", "hyundai", "kia", "ford", "chevrolet",
    "bmw", "mercedes-benz", "audi", "lexus", "mazda", "volkswagen", "jeep", "land-rover",
]


def scrape_make(token: str, make: str, limit: int) -> list[dict]:
    url = f"{BASE}/acts/{ACTOR}/run-sync-get-dataset-items?token={token}"
    # Only the two documented inputs. Apify validates input against the actor's schema —
    # a well-meant extra key ("includeImages") 400'd every request of a whole run.
    payload = {
        "startUrl": f"https://dubai.dubizzle.com/motors/used-cars/{make}/",
        "maxResults": limit,
    }
    r = requests.post(url, json=payload, timeout=600)
    r.raise_for_status()
    items = r.json()
    return items if isinstance(items, list) else []


_IMG_EXT = (".jpg", ".jpeg", ".png", ".webp", ".avif")


def _harvest_image_urls(node, out: dict[str, None] | None = None, depth: int = 0) -> list[str]:
    """
    Collect every image URL anywhere in the raw Apify item, whatever the schema.

    The first cron run proved why: 634 rows were scraped with the old fixed-key probe
    (`images` / `photos` / `imageUrls` / …) and every single photo_urls came back empty —
    the actor nests its media under keys we never guessed. Guessing key names loses to
    walking the whole payload for things that LOOK like image URLs; a schema change can
    hide a key, but it can't make an image URL stop being one.
    """
    if out is None:
        out = {}
    if depth > 6 or len(out) >= 24:  # listings carry ~5-15 photos; more is scraper noise
        return list(out)
    if isinstance(node, str):
        u = node.strip()
        if u.startswith("http"):
            path = u.split("?", 1)[0].lower()
            if path.endswith(_IMG_EXT) or "/image" in path or "img.dubizzle" in path:
                out.setdefault(u)
    elif isinstance(node, dict):
        for v in node.values():
            _harvest_image_urls(v, out, depth + 1)
    elif isinstance(node, (list, tuple)):
        for v in node:
            _harvest_image_urls(v, out, depth + 1)
    return list(out)


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

    # Retain listing photo URLs (master plan WS 0.7): they cost nothing to keep and are
    # the prerequisite for the UAE-domain CV test set (A1) and photo-aware pricing (B2/D1).
    photo_urls = "|".join(_harvest_image_urls(raw))[:2000]

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
        "photo_urls": photo_urls,
        # log_price (the model's target) is filled in one vectorised pass by the caller
    }


def append_price_history(sightings: list[dict], corpus: pd.DataFrame) -> tuple[int, int]:
    """
    Append this run's sightings to the price-history file; seed it from the corpus on first
    run (one baseline snapshot per existing listing, so time-on-market has a start point).
    Returns (snapshots_appended, price_changes_observed).
    """
    if HISTORY.exists():
        hist = pd.read_csv(HISTORY, dtype={"listing_id": str})
    else:
        # Seed: the corpus row is each listing's earliest known sighting. Rows predating the
        # scraped_at column fall back to createdAt; both empty -> unknown start, still seeded
        # so a later disappearance ("sold-proxy") is detectable.
        hist = pd.DataFrame({
            "listing_id": corpus["listing_id"].astype(str),
            "scraped_at": corpus.get("scraped_at", pd.Series(dtype=str)).fillna("")
                          .replace("", pd.NA).fillna(corpus.get("createdAt", pd.Series(dtype=str)).fillna("")),
            "price": corpus["price"],
        })
        print(f"seeded price history with {len(hist)} baseline snapshots from the corpus")

    new = pd.DataFrame(sightings, columns=["listing_id", "scraped_at", "price"])
    new["listing_id"] = new["listing_id"].astype(str)
    # price changes: sightings whose price differs from the listing's latest recorded one
    latest = hist.sort_values("scraped_at").groupby("listing_id")["price"].last()
    changed = int(sum(
        lid in latest.index and float(latest[lid]) != float(p)
        for lid, p in zip(new["listing_id"], new["price"])
    ))
    out = pd.concat([hist, new], ignore_index=True)
    # one snapshot per listing per run: exact (listing_id, scraped_at) duplicates are noise
    out = out.drop_duplicates(subset=["listing_id", "scraped_at"], keep="first")
    out.to_csv(HISTORY, index=False)
    return len(out) - len(hist), changed


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

    run_at = datetime.now(timezone.utc).isoformat()
    fresh: list[dict] = []
    sightings: list[dict] = []  # EVERY normalised row, new or re-seen — the time dimension
    for make in MAKES:
        try:
            items = scrape_make(token, make, args.per_make)
        except Exception as e:  # one bad make must never sink the whole run
            # Name the failure. A run once burned itself down printing 16 bare
            # "HTTPError"s — status + body is the difference between a 60-second
            # diagnosis (bad input schema / dead token / quota) and guessing.
            detail = ""
            resp = getattr(e, "response", None)
            if resp is not None:
                detail = f" [{resp.status_code}] {resp.text[:200]!r}"
            print(f"  {make}: scrape failed ({type(e).__name__}){detail} — skipping")
            continue
        added = seen_again = with_photos = 0
        for raw in items:
            row = normalise(raw, make)
            if not row:
                continue
            sightings.append({"listing_id": row["listing_id"], "scraped_at": run_at,
                              "price": row["price"]})
            if row["listing_id"] in known:
                seen_again += 1  # re-seen: still on the market — that's the ToM signal
            else:
                known.add(row["listing_id"])
                fresh.append(row)
                added += 1
                with_photos += bool(row["photo_urls"])
        # photo retention must prove itself per run — it shipped once before and silently
        # produced 0 photos across an entire cron run because nothing reported it
        print(f"  {make}: {len(items)} scraped, {added} new, {seen_again} re-seen, "
              f"{with_photos} with photos")
        time.sleep(1)  # be polite to the free tier

    # History accrues even on a run with zero NEW listings — re-sightings are the whole
    # point (still-listed = unsold; a lower price = a drop; absence later = sold-proxy).
    if sightings:
        n_snap, n_changed = append_price_history(sightings, existing)
        print(f"price history: +{n_snap} snapshots ({n_changed} price changes observed) "
              f"-> {HISTORY}")

    if not fresh:
        print("no new listings — corpus unchanged.")
        return 0

    import numpy as np
    df = pd.DataFrame(fresh)
    df["log_price"] = np.log(df["price"])
    df["scraped_at"] = run_at  # same timestamp as the history snapshots from this run

    for backfill in ("scraped_at", "photo_urls"):
        if backfill not in existing.columns:
            existing[backfill] = ""

    out = pd.concat([existing, df], ignore_index=True)
    out = out.drop_duplicates(subset=["listing_id"], keep="first")
    out.to_csv(CSV, index=False)
    n_photos = int((out["photo_urls"].fillna("").astype(str).str.len() > 0).sum())
    print(f"added {len(out) - len(existing)} new listings -> {len(out)} total "
          f"({n_photos} rows carry photo URLs)")
    # length-based, matching the n_photos check above: astype(bool) treats a stray NaN as
    # truthy, which would silently suppress this "zero photos" warning — the exact failure
    # this warning exists to catch.
    if not (df["photo_urls"].fillna("").astype(str).str.len() > 0).any():
        print("::warning::this run retained ZERO photos — check the actor's output schema")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
