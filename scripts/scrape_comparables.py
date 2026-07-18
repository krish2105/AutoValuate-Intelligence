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

# --- Cost model (confirmed live from the Apify API for agenscrape/dubizzle-uae-scraper,
# account userTier=FREE): PAY_PER_EVENT at $0.003 per returned result and $0.00005 per
# actor start. RESULTS are ~99.8% of the bill; starts are rounding error, so adding MAKES
# is nearly free and only the ITEM TOTAL matters.
#
# This is why the quota kept running out: the previous flat 16 makes x 40 = 640 items/run
# cost $1.92/run = $7.68/mo over four Mondays and $9.60 over five — against a $5/mo free
# credit. The cron was structurally 54-92% over budget, so it died mid-month and the corpus
# stopped growing. A smaller sustainable run beats a larger one that halts.
PRICE_PER_RESULT_USD = 0.003
FREE_CREDIT_USD_PER_MONTH = 5.00
# Billing is on RESULTS RETURNED, not results requested, and the actor has been observed
# returning a little more than maxResults. Quote costs with headroom so the forecast is an
# upper bound rather than a best case.
OVER_DELIVERY_FACTOR = 1.20
# Mirror of the price Check in scripts/corpus_schema.py. Enforced at normalise() time so a
# single out-of-range listing is dropped instead of failing validation for the whole run.
PRICE_SANITY_MIN, PRICE_SANITY_MAX = 1_000.0, 5_000_000.0
# 240 items/run = $0.72/run = $3.60/mo across five Mondays — ~28% headroom under the credit.
MAX_ITEMS_PER_RUN = 240

# Per-make item allocation. Luxury is deliberately over-weighted: the pricing model's
# luxury conformal band is its weakest segment, and 96% of luxury rows come from just four
# makes (mercedes-benz, bmw, lexus, audi) while porsche/tesla sit at ZERO rows. Luxury also
# carries ~2x the price dispersion of mass, so it needs more rows per unit of accuracy.
# Mass makes already hold 100+ rows each and are kept at a maintenance trickle — enough to
# preserve retrieval diversity, not enough to buy depth we already have.
#
# INVARIANT: sum(ALLOCATION) must stay <= MAX_ITEMS_PER_RUN. main() enforces it before any
# HTTP call, scaling proportionally rather than overspending.
ALLOCATION = {
    # --- luxury, starved: zero/near-zero rows but real Dubai inventory (biggest gain) ---
    "porsche":       20,   # 0 rows
    "tesla":         20,   # 0 rows
    "gmc":           20,   # 2 rows
    "infiniti":      18,   # 3 rows
    "cadillac":      15,   # 2 rows
    "land-rover":    15,   # 64 rows (stored as "land rover" — see models/brand_tier.py)
    "jaguar":         8,   # 1 row, genuinely thin inventory
    # --- luxury, the existing calibration base: keep its centre from going stale ---
    "mercedes-benz": 10,
    "bmw":           10,
    "audi":           7,
    "lexus":          7,
    # --- mass: maintenance only (all already 54-132 rows) ---
    "toyota":        12,
    "nissan":        12,
    "ford":          10,
    "honda":         10,
    "hyundai":       10,
    "chevrolet":      8,
    "kia":            8,
    "mazda":          6,
    "mitsubishi":     5,
    "volkswagen":     5,
    "jeep":           4,
}
# bentley / rolls-royce / maserati are deliberately EXCLUDED: UAE inventory is scarce and
# bespoke-spec, so the spend buys a handful of high-variance rows that cannot calibrate.
# Those makes need an honest wider-band / low-confidence path, not a scraping push.

MAKES = list(ALLOCATION)  # kept as a name for readability; order drives the scrape loop


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
    # Drop listings the corpus schema would reject, HERE, where it costs one row — rather
    # than letting them through to validate_corpus, which returns non-zero on any error and
    # would abort the whole weekly run before the commit step (a red X and zero growth for
    # one bad listing). Bounds mirror corpus_schema.py exactly; keep them in lock-step.
    if not (PRICE_SANITY_MIN <= price <= PRICE_SANITY_MAX):
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
        def col(name: str) -> pd.Series:
            # df.get() with a Series default returns an EMPTY, index-misaligned Series when
            # the column is absent — materialise one on the corpus's own index instead.
            s = corpus[name] if name in corpus.columns else pd.Series("", index=corpus.index)
            return s.fillna("").astype(str)

        scraped, created = col("scraped_at"), col("createdAt")
        hist = pd.DataFrame({
            "listing_id": corpus["listing_id"].astype(str),
            "scraped_at": scraped.where(scraped.str.len() > 0, created),
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
    ap.add_argument("--budget", type=int, default=MAX_ITEMS_PER_RUN,
                    help="hard ceiling on items requested this run — the quota rail")
    ap.add_argument("--scale", type=float, default=1.0,
                    help="scale every per-make allocation (0.25 = a cheap smoke run)")
    ap.add_argument("--per-make", type=int, default=None,
                    help="legacy flat override: same limit for every make, still budget-capped")
    args = ap.parse_args()

    # Build the plan, then fit it under the budget BEFORE spending a single API call.
    if args.per_make is not None:  # legacy path — kept so old workflow inputs still work
        plan = {m: args.per_make for m in ALLOCATION}
    else:
        plan = {m: max(1, int(round(n * args.scale))) for m, n in ALLOCATION.items()}

    total = sum(plan.values())
    if total > args.budget:
        # Scale down proportionally rather than refuse: a capped run still grows the corpus
        # and keeps the cron green. Then TRIM the remainder — rounding up per make (and the
        # min-1 floor) can otherwise leave the plan above the budget, which made the earlier
        # "can never exceed" claim false (--budget 24 produced 25 items).
        factor = args.budget / total
        plan = {m: max(1, int(n * factor)) for m, n in plan.items()}
        # Drop one item at a time from the largest allocations until we genuinely fit. Makes
        # already at 1 are left alone, so a budget below len(plan) is simply unsatisfiable.
        while sum(plan.values()) > args.budget and any(v > 1 for v in plan.values()):
            worst = max((m for m in plan if plan[m] > 1), key=lambda m: plan[m])
            plan[worst] -= 1
        print(f"::warning::plan requested {total} items > budget {args.budget} — "
              f"scaled down by {factor:.2f} to fit")
        total = sum(plan.values())
        if total > args.budget:  # only reachable when budget < number of makes
            print(f"::warning::budget {args.budget} is below the {len(plan)}-make floor; "
                  f"requesting {total}. Trim ALLOCATION to go lower.")

    # Apify bills RETURNED results, and the actor has been observed returning slightly more
    # than maxResults, so quote the forecast with headroom rather than a best case.
    est = total * PRICE_PER_RESULT_USD * OVER_DELIVERY_FACTOR
    print(f"plan: {len(plan)} makes, {total} items, est. <=${est:.2f}/run "
          f"(${est * 4.33:.2f}/mo weekly vs ${FREE_CREDIT_USD_PER_MONTH:.2f} free credit)")

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
    for make, limit in plan.items():
        try:
            items = scrape_make(token, make, limit)
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
