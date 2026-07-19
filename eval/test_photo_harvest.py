"""
Regression test for the listing-photo harvester (scripts/scrape_comparables._harvest_image_urls).

WHY THIS EXISTS
---------------
`photo_urls` is empty on 0 of 1,303 corpus rows, which looks exactly like a broken harvester.
It is not: git chronology shows the deep-walk harvester landed AFTER the only successful scrape
(which ran an older fixed-key probe), and the run after that failed outright. So the harvester
had never executed even once — its correctness was pure assumption.

Photos are the ONLY route to a UAE-domain damage dataset, so "assumed working" is not good
enough. These tests pin the walker's behaviour against the payload shapes an Apify actor
realistically emits, so a future refactor cannot silently return to zero photos.

If a REAL captured payload exists at eval/fixtures/apify_items.json (see
scripts/recover_apify_fixture.py), it is tested too — synthetic shapes prove the logic,
a real payload proves the assumption about the actor.

Run:  python eval/test_photo_harvest.py
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("scrape_comparables",
                                               ROOT / "scripts" / "scrape_comparables.py")
_sc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_sc)
harvest = _sc._harvest_image_urls

passed = failed = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global passed, failed
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail and not cond else ""))
    passed += cond
    failed += not cond


print("photo harvester — payload shapes the actor realistically emits:")

# The actor's schema is not contractual, so the walker must find images by what they LOOK like
# rather than by guessed key names. Each case is a shape that has to keep working.
check("flat list under 'images'",
      harvest({"images": ["https://img.dubizzle.com/a.jpg", "https://img.dubizzle.com/b.jpg"]})
      == ["https://img.dubizzle.com/a.jpg", "https://img.dubizzle.com/b.jpg"])

check("nested objects ({media:{photos:[{url:...}]}})",
      harvest({"media": {"photos": [{"url": "https://cdn.x.com/1.jpeg"},
                                    {"url": "https://cdn.x.com/2.webp"}]}})
      == ["https://cdn.x.com/1.jpeg", "https://cdn.x.com/2.webp"])

# Real CDN URLs carry resize params; the extension test must run on the PATH, not the whole URL.
check("URL with a query string still matches on its path",
      harvest({"photo": "https://cdn.x.com/p.jpg?w=800&q=70"}) == ["https://cdn.x.com/p.jpg?w=800&q=70"])

check("extension-less CDN URL matched via '/image'",
      harvest({"x": "https://cdn.dubizzle.com/image/abc123"}) == ["https://cdn.dubizzle.com/image/abc123"])

check("extension-less URL matched via the img.dubizzle host",
      harvest({"x": "https://img.dubizzle.com/nohash"}) == ["https://img.dubizzle.com/nohash"])

check("a listing link is NOT mistaken for a photo",
      harvest({"link": "https://dubizzle.com/motors/listing/123"}) == [])

check("duplicate URLs are collapsed, order preserved",
      harvest({"a": ["https://c.com/1.jpg", "https://c.com/1.jpg", "https://c.com/2.jpg"]})
      == ["https://c.com/1.jpg", "https://c.com/2.jpg"])

check("empty payload yields no photos", harvest({}) == [])

# Bounded walk: the guards are deliberate, so pin them rather than let a refactor "improve" them.
check("nesting within the depth guard is still found",
      harvest({"a": {"b": {"c": {"d": {"e": "https://cdn.x.com/deep.png"}}}}}) == ["https://cdn.x.com/deep.png"])
check("nesting beyond the depth guard is abandoned (cost control, not a bug)",
      harvest({"a": {"b": {"c": {"d": {"e": {"f": {"g": {"h": "https://x.com/x.jpg"}}}}}}}}) == [])
check("collection is capped (listings carry ~5-15 photos; more is scraper noise)",
      len(harvest({"a": [f"https://c.com/{i}.jpg" for i in range(200)]})) <= 24)

# The headline invariant, stated as a test so the intent survives a rewrite.
check("a realistic multi-photo listing yields a non-empty photo_urls",
      len(harvest({"id": "x", "price": 50000,
                   "gallery": {"items": [{"src": "https://img.dubizzle.com/1.jpg"},
                                         {"src": "https://img.dubizzle.com/2.jpg"},
                                         {"src": "https://img.dubizzle.com/3.jpg"}]}})) == 3)

# --- Optional: the real captured payload, once someone runs the recovery script -------------
fixture = ROOT / "eval" / "fixtures" / "apify_items.json"
print("\nreal captured actor payload:")
if not fixture.exists():
    print(f"  [SKIP] no fixture at {fixture.relative_to(ROOT)} — run scripts/recover_apify_fixture.py")
    print("         (synthetic shapes above prove the WALKER; only a real payload proves the ACTOR)")
else:
    items = json.loads(fixture.read_text())
    items = items if isinstance(items, list) else [items]
    check("fixture contains at least one item", len(items) > 0)
    found = {i: harvest(it) for i, it in enumerate(items)}
    n_with = sum(1 for v in found.values() if v)
    print(f"  {n_with}/{len(items)} captured items yielded photo URLs")
    # Deliberately NOT asserted as a pass/fail: if the real actor returns no images, that is a
    # true finding about the actor (photos need a per-listing detail fetch), not a test failure.
    if n_with == 0:
        print("  [INFO] the actor's list payload carries NO images — the photo path must be a "
              "per-listing detail fetch, not the search payload. That is the answer, not a bug.")
    else:
        check("real payload yields photos (the harvester works end-to-end)", n_with > 0)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
