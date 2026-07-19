"""
Capture a REAL Apify actor payload as a committed test fixture.

WHY
---
`photo_urls` is empty on every corpus row. eval/test_photo_harvest.py proves the WALKER is
correct against realistic shapes, but only a real captured payload answers the remaining
question: does this actor's *search* response actually carry image URLs at all, or do photos
require a per-listing detail fetch? That single fact decides the whole UAE-image strategy, and
guessing it wrong costs months.

COST: zero. Listing runs and reading a dataset are not billed — only *results produced by a new
run* are. This script never starts an actor run; it only reads what a past run already produced.

TIME LIMIT: Apify free-tier datasets are retained ~7 days. After the last run's data expires,
answering this question again means paying for a fresh run.

USAGE
    APIFY_TOKEN=... python scripts/recover_apify_fixture.py
    python scripts/recover_apify_fixture.py --limit 3 --out eval/fixtures/apify_items.json

Or run it in CI without handling the token locally — see the "capture-apify-fixture" job in
.github/workflows/scrape-comparables.yml, which uses the APIFY_TOKEN secret that already exists.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import requests

BASE = "https://api.apify.com/v2"
ACTOR_HINT = "dubizzle"  # substring match, so a rename of the actor does not break this


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=3, help="how many items to keep in the fixture")
    ap.add_argument("--out", default="eval/fixtures/apify_items.json")
    args = ap.parse_args()

    token = os.environ.get("APIFY_TOKEN", "").strip()
    if not token:
        print("APIFY_TOKEN not set — nothing to do (no-op, not a failure).\n"
              "Set it, or run the capture-apify-fixture workflow job which already has the secret.")
        return 0

    # Most recent runs first. Reading run metadata is free.
    r = requests.get(f"{BASE}/actor-runs", params={"token": token, "limit": 50, "desc": "true"},
                     timeout=60)
    r.raise_for_status()
    runs = r.json().get("data", {}).get("items", [])
    if not runs:
        print("no actor runs found on this account.")
        return 1

    # Prefer a SUCCEEDED run of the dubizzle actor that actually produced items.
    candidates = [x for x in runs if ACTOR_HINT in json.dumps(x).lower()] or runs
    for run in candidates:
        ds = run.get("defaultDatasetId")
        if not ds or run.get("status") != "SUCCEEDED":
            continue
        d = requests.get(f"{BASE}/datasets/{ds}/items",
                         params={"token": token, "limit": args.limit}, timeout=60)
        if not d.ok:
            continue
        items = d.json()
        if not isinstance(items, list) or not items:
            continue

        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(items, indent=2, ensure_ascii=False))
        print(f"captured {len(items)} item(s) from run {run.get('id')} "
              f"(finished {run.get('finishedAt')}) -> {out}")

        # Answer the actual question immediately, so the operator does not have to.
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import importlib.util
        spec = importlib.util.spec_from_file_location("sc", Path(__file__).resolve().parent / "scrape_comparables.py")
        sc = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(sc)
        hits = [sc._harvest_image_urls(it) for it in items]
        n = sum(1 for h in hits if h)
        print(f"\nphoto URLs found in {n}/{len(items)} captured items")
        if n:
            print("=> the search payload DOES carry images. The harvester will populate "
                  "photo_urls on the next successful scrape. No code change needed.")
        else:
            print("=> the search payload carries NO images. Photos require a per-listing "
                  "detail fetch; plan the UAE image pipeline around that, not around this actor.")
        print("\nTop-level keys of item 0 (for designing the detail fetch if needed):")
        print(" ", sorted(items[0].keys()) if isinstance(items[0], dict) else type(items[0]))
        return 0

    print("no SUCCEEDED run with a readable, non-empty dataset was found "
          "(free-tier datasets are retained ~7 days).")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
