"""
UAE-domain CV dataset builder (master plan A1/A2/A6 — the domain-adaptation prerequisite).

The damage detector was trained on CarDD+VehiDE — curated, mostly-Western, often close-up
photos. Real UAE listing photos (harsh sun, dust film, whole-car framing, showroom floors)
are a different distribution, and the detector's held-out numbers say nothing about them.
This script turns the corpus's retained listing photos into three things:

  1. a PSEUDO-LABELED YOLO dataset — detections at high confidence (>= TRAIN_CONF) become
     training labels for the Kaggle fine-tune (notebooks/08). Pseudo-labels at 0.60+ from
     the current model are imperfect but directionally right, and mixing them with the
     original gold data adapts the model to UAE imagery without hand-labeling everything.
  2. a REVIEW QUEUE — crops the detector was unsure about (border confidence). These are
     the single highest-value images a human can label: an active-learning round over
     exactly these is master plan A6.
  3. an honest STATS file (eval/uae_cv_set_stats.json) — committed, so the repo records
     what the UAE set actually contains instead of a vibe.

Everything heavy stays under data/raw/ (gitignored). Run where egress is open (GitHub
Actions or locally); the agent-proxy in some dev sandboxes blocks image CDNs.

Usage:
  ENABLE_LOCAL_CV=1 python scripts/build_uae_cv_set.py [--limit 400] [--per-listing 4]
  (requires: onnxruntime, opencv-python-headless, pillow, pandas, httpx)
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-api"))

CSV = ROOT / "data" / "processed" / "comparables.csv"
OUT = ROOT / "data" / "raw" / "uae_cv_set"
STATS = ROOT / "eval" / "uae_cv_set_stats.json"

CLASSES = ["dent", "scratch", "crack", "glass_shatter", "lamp_broken", "tire_flat", "punctured", "missing_part"]
TRAIN_CONF = 0.60    # >= this: detection becomes a pseudo-label
REVIEW_LO = 0.33     # [REVIEW_LO, TRAIN_CONF): goes to the human review queue
MIN_SIDE = 300       # px — drops avatars/thumbnails the URL harvester may have caught
VAL_FRACTION = 0.15  # deterministic listing-level split (a listing's photos never straddle it)
SEED = 42


def _download(url: str, timeout: float = 20.0) -> "bytes | None":
    import httpx
    try:
        r = httpx.get(url, timeout=timeout, follow_redirects=True)
        r.raise_for_status()
        return r.content
    except Exception:
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=400, help="max listings to process")
    ap.add_argument("--per-listing", type=int, default=4, help="max photos per listing")
    args = ap.parse_args()

    import os
    os.environ.setdefault("ENABLE_LOCAL_CV", "1")
    import pandas as pd
    from PIL import Image

    from agents import cv_local
    if not cv_local.available():
        print("local CV unavailable (ENABLE_LOCAL_CV + cv-service/model/best.onnx required)", file=sys.stderr)
        return 1

    df = pd.read_csv(CSV)
    df["photo_urls"] = df.get("photo_urls", "").fillna("").astype(str)
    rows = df[df["photo_urls"].str.len() > 0]
    if rows.empty:
        print("corpus has no photo_urls yet — run the scrape cron (fixed harvester) first; "
              "this script is a no-op until photos accrue.")
        STATS.write_text(json.dumps({"listings_with_photos": 0, "note": "no photos in corpus yet"}, indent=2) + "\n")
        return 0

    for sub in ("images/train", "images/val", "labels/train", "labels/val", "review"):
        (OUT / sub).mkdir(parents=True, exist_ok=True)

    rng = random.Random(SEED)
    stats = {"listings_with_photos": int(len(rows)), "listings_processed": 0, "images_ok": 0,
             "images_skipped_small": 0, "images_failed": 0, "pseudo_labels": 0,
             "review_crops": 0, "per_class": {c: 0 for c in CLASSES}}
    manifest = []

    for _, row in rows.head(args.limit).iterrows():
        lid = str(row["listing_id"])
        h = int(hashlib.sha256(lid.encode()).hexdigest(), 16) % 1000
        split = "val" if h < VAL_FRACTION * 1000 else "train"
        urls = [u for u in row["photo_urls"].split("|") if u.strip()][: args.per_listing]
        stats["listings_processed"] += 1

        for k, url in enumerate(urls):
            data = _download(url)
            if data is None:
                stats["images_failed"] += 1
                continue
            try:
                img = Image.open(io.BytesIO(data)).convert("RGB")
            except Exception:
                stats["images_failed"] += 1
                continue
            if min(img.size) < MIN_SIDE:
                stats["images_skipped_small"] += 1
                continue

            name = f"{lid}_{k}"
            img_path = OUT / "images" / split / f"{name}.jpg"
            img.save(img_path, "JPEG", quality=90)
            stats["images_ok"] += 1

            import base64
            dets = cv_local.detect(base64.b64encode(data).decode())
            label_lines = []
            for d in dets:
                x1, y1, x2, y2 = d["box"]
                cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
                w, hgt = x2 - x1, y2 - y1
                if d["confidence"] >= TRAIN_CONF:
                    label_lines.append(f"{CLASSES.index(d['label'])} {cx:.4f} {cy:.4f} {w:.4f} {hgt:.4f}")
                    stats["pseudo_labels"] += 1
                    stats["per_class"][d["label"]] += 1
                elif d["confidence"] >= REVIEW_LO:
                    # border-confidence crop -> the human review queue (active learning A6)
                    W, H = img.size
                    pad = 0.06
                    crop = img.crop((max(0, int((x1 - pad) * W)), max(0, int((y1 - pad) * H)),
                                     min(W, int((x2 + pad) * W)), min(H, int((y2 + pad) * H))))
                    if min(crop.size) >= 32:
                        cname = f"{name}_{d['label']}_{int(d['confidence'] * 100)}.jpg"
                        crop.save(OUT / "review" / cname, "JPEG", quality=90)
                        manifest.append({"crop": cname, "image": f"{name}.jpg", "split": split,
                                         "label_guess": d["label"], "confidence": d["confidence"]})
                        stats["review_crops"] += 1
            # empty label files are meaningful: a confidently-clean UAE photo is a true
            # negative, and YOLO treats a present-but-empty .txt as "background image"
            (OUT / "labels" / split / f"{name}.txt").write_text("\n".join(label_lines) + ("\n" if label_lines else ""))

    (OUT / "review" / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (OUT / "dataset.yaml").write_text(
        "path: .\ntrain: images/train\nval: images/val\n"
        f"names: {json.dumps(dict(enumerate(CLASSES)))}\n"
    )
    STATS.write_text(json.dumps(stats, indent=2) + "\n")
    print(json.dumps(stats, indent=2))
    print(f"dataset -> {OUT}  ·  review queue -> {OUT / 'review'}  ·  stats -> {STATS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
