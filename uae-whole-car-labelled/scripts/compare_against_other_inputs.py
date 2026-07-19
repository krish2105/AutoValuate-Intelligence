#!/usr/bin/env python3
"""Check that UAE images do not overlap other notebook inputs."""

from __future__ import annotations

import argparse
import hashlib
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageOps

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def dhash(path: Path, hash_size: int = 8) -> int:
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image).convert("L").resize(
            (hash_size + 1, hash_size),
            Image.Resampling.LANCZOS,
        )
        pixels = list(image.getdata())
    value = 0
    for row in range(hash_size):
        start = row * (hash_size + 1)
        for col in range(hash_size):
            value <<= 1
            value |= int(pixels[start + col] > pixels[start + col + 1])
    return value


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def collect(root: Path):
    return sorted(
        p
        for p in root.rglob("*")
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_root")
    parser.add_argument("--damage-unified")
    parser.add_argument("--framing-auxiliary")
    args = parser.parse_args()

    uae_root = Path(args.dataset_root).expanduser().resolve()
    uae_test = collect(uae_root / "test" / "images")
    if not uae_test:
        print("UAE test split is empty")
        return 1

    others = []
    for label, value in (
        ("damage-unified", args.damage_unified),
        ("framing-auxiliary", args.framing_auxiliary),
    ):
        if value:
            path = Path(value).expanduser().resolve()
            others.extend((label, p) for p in collect(path))

    if not others:
        print("Provide at least one comparison root.")
        return 1

    errors = []
    warnings = []
    other_sha = defaultdict(list)
    other_dhash = []

    for label, path in others:
        other_sha[sha256_file(path)].append((label, path))
        try:
            other_dhash.append((label, path, dhash(path)))
        except Exception as exc:
            warnings.append(f"Could not hash {path}: {exc}")

    for test_path in uae_test:
        checksum = sha256_file(test_path)
        if checksum in other_sha:
            for label, other_path in other_sha[checksum]:
                errors.append(
                    f"Exact UAE test overlap with {label}: "
                    f"{test_path} <-> {other_path}"
                )

        try:
            test_hash = dhash(test_path)
        except Exception as exc:
            warnings.append(f"Could not hash {test_path}: {exc}")
            continue

        for label, other_path, other_hash in other_dhash:
            distance = hamming(test_hash, other_hash)
            if distance <= 2 and checksum != sha256_file(other_path):
                errors.append(
                    f"Likely near-overlap with {label}: {test_path} <-> "
                    f"{other_path} (dHash {distance})"
                )
            elif distance <= 6:
                warnings.append(
                    f"Possible near-overlap with {label}: {test_path} <-> "
                    f"{other_path} (dHash {distance})"
                )

    if warnings:
        print("\nWarnings")
        for warning in warnings:
            print("-", warning)

    if errors:
        print("\nFAILED")
        for error in errors:
            print("-", error)
        return 1

    print("PASS: no exact or likely near-overlap found for UAE test images.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
