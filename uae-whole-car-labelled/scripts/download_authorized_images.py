#!/usr/bin/env python3
"""Download only explicitly authorised direct image URLs.

This script is intentionally not a scraper. It reads authorized_downloads.csv and
refuses rows that are not approved for ML use.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import requests
from PIL import Image, ImageOps

SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
MAX_BYTES = 40 * 1024 * 1024


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_root", nargs="?", default=".")
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()

    root = Path(args.dataset_root).expanduser().resolve()
    csv_path = root / "authorized_downloads.csv"
    out_dir = root / "incoming" / "images"
    out_dir.mkdir(parents=True, exist_ok=True)

    if not csv_path.is_file():
        print(f"Missing {csv_path}")
        return 1

    rows = list(csv.DictReader(csv_path.open(encoding="utf-8")))
    if not rows:
        print("No rows found in authorized_downloads.csv")
        return 1

    errors = []
    report = []

    for number, row in enumerate(rows, start=2):
        url = (row.get("url") or "").strip()
        filename = (row.get("filename") or "").strip()
        approved = (row.get("approved_for_ml") or "").strip().lower()
        permission = (row.get("license_or_permission") or "").strip()
        evidence = (row.get("permission_evidence") or "").strip()

        prefix = f"row {number}"

        if approved not in {"yes", "true", "approved"}:
            errors.append(f"{prefix}: approved_for_ml must be yes")
            continue
        if not permission or not evidence:
            errors.append(f"{prefix}: permission and evidence are required")
            continue
        if not SAFE_NAME.fullmatch(filename):
            errors.append(f"{prefix}: unsafe filename {filename!r}")
            continue
        parsed = urlparse(url)
        if parsed.scheme != "https":
            errors.append(f"{prefix}: only HTTPS direct image URLs are allowed")
            continue

        destination = out_dir / filename
        if destination.exists():
            errors.append(f"{prefix}: destination already exists: {destination}")
            continue

        try:
            response = requests.get(
                url,
                timeout=args.timeout,
                stream=True,
                headers={"User-Agent": "AuthorizedDatasetCollector/1.0"},
            )
            response.raise_for_status()

            data = bytearray()
            for chunk in response.iter_content(1024 * 1024):
                data.extend(chunk)
                if len(data) > MAX_BYTES:
                    raise ValueError("download exceeds 40 MiB limit")

            with Image.open(io.BytesIO(data)) as image:
                image = ImageOps.exif_transpose(image)
                image.load()
                if image.width < 320 or image.height < 320:
                    raise ValueError(
                        f"image is too small: {image.width}x{image.height}"
                    )
                # Re-save to strip EXIF and metadata.
                if destination.suffix.lower() in {".jpg", ".jpeg"}:
                    image.convert("RGB").save(
                        destination, format="JPEG", quality=95, optimize=True
                    )
                elif destination.suffix.lower() == ".png":
                    image.save(destination, format="PNG", optimize=True)
                elif destination.suffix.lower() == ".webp":
                    image.convert("RGB").save(
                        destination, format="WEBP", quality=95, method=6
                    )
                else:
                    raise ValueError("use .jpg, .jpeg, .png, or .webp")

            report.append(
                {
                    "filename": filename,
                    "url": url,
                    "sha256": sha256_bytes(destination.read_bytes()),
                    "size_bytes": destination.stat().st_size,
                }
            )
            print("Downloaded:", destination)

        except Exception as exc:
            if destination.exists():
                destination.unlink()
            errors.append(f"{prefix}: {exc}")

    report_path = root / "authorized_download_report.csv"
    with report_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=["filename", "url", "sha256", "size_bytes"]
        )
        writer.writeheader()
        writer.writerows(report)

    if errors:
        print("\nFAILED")
        for error in errors:
            print("-", error)
        return 1

    print(f"\nPASS: downloaded {len(report)} authorised image(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
