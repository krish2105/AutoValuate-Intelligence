#!/usr/bin/env python3
"""Strict validator for the UAE whole-car labelled YOLO dataset."""

from __future__ import annotations

import argparse
import csv
import hashlib
import math
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import yaml
from PIL import Image, ImageOps, UnidentifiedImageError

EXPECTED_NAMES = [
    "dent",
    "scratch",
    "crack",
    "glass_shatter",
    "lamp_broken",
    "tire_flat",
    "punctured",
    "missing_part",
]
SPLITS = ("train", "val", "test")
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


@dataclass(frozen=True)
class ImageInfo:
    split: str
    path: Path
    width: int
    height: int
    sha256: str
    dhash: int


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def difference_hash(image: Image.Image, hash_size: int = 8) -> int:
    gray = image.convert("L").resize(
        (hash_size + 1, hash_size),
        Image.Resampling.LANCZOS,
    )
    pixels = list(gray.getdata())
    value = 0
    for row in range(hash_size):
        start = row * (hash_size + 1)
        for col in range(hash_size):
            value <<= 1
            value |= int(pixels[start + col] > pixels[start + col + 1])
    return value


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def normalize_names(value):
    if isinstance(value, list):
        return [str(v) for v in value]
    if isinstance(value, dict):
        converted = {}
        for key, name in value.items():
            try:
                converted[int(key)] = str(name)
            except (TypeError, ValueError):
                return None
        if sorted(converted) != list(range(len(converted))):
            return None
        return [converted[i] for i in range(len(converted))]
    return None


def inspect_image(path: Path, split: str, errors, warnings, min_side: int):
    if not SAFE_NAME.fullmatch(path.name):
        errors.append(f"{path}: unsafe filename")

    try:
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            image = ImageOps.exif_transpose(image)
            image.load()
            width, height = image.size
            dhash = difference_hash(image)
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        errors.append(f"{path}: corrupt or unreadable image ({exc})")
        return None

    if min(width, height) < min_side:
        warnings.append(
            f"{path}: short side {min(width, height)}px is below {min_side}px"
        )

    return ImageInfo(
        split=split,
        path=path,
        width=width,
        height=height,
        sha256=sha256_file(path),
        dhash=dhash,
    )


def validate_label(path: Path, errors, class_counts):
    try:
        text = path.read_text(encoding="utf-8").strip()
    except UnicodeDecodeError:
        errors.append(f"{path}: labels must be UTF-8")
        return

    if not text:
        errors.append(f"{path}: empty positive label")
        return

    for line_number, line in enumerate(text.splitlines(), start=1):
        parts = line.split()
        prefix = f"{path}:{line_number}"

        if len(parts) != 5:
            errors.append(f"{prefix}: expected exactly 5 values")
            continue

        try:
            class_value = float(parts[0])
            coords = [float(v) for v in parts[1:]]
        except ValueError:
            errors.append(f"{prefix}: all values must be numeric")
            continue

        if not class_value.is_integer():
            errors.append(f"{prefix}: class_id must be an integer")
            continue

        class_id = int(class_value)
        if not 0 <= class_id < len(EXPECTED_NAMES):
            errors.append(f"{prefix}: class_id must be 0..7")
            continue

        if not all(math.isfinite(v) for v in coords):
            errors.append(f"{prefix}: coordinates must be finite")
            continue

        x, y, w, h = coords
        if not all(0.0 <= v <= 1.0 for v in coords):
            errors.append(f"{prefix}: coordinates must be normalized to 0..1")
            continue
        if w <= 0 or h <= 0:
            errors.append(f"{prefix}: width and height must be greater than 0")
            continue

        left, top = x - w / 2, y - h / 2
        right, bottom = x + w / 2, y + h / 2
        tolerance = 1e-6
        if (
            left < -tolerance
            or top < -tolerance
            or right > 1 + tolerance
            or bottom > 1 + tolerance
        ):
            errors.append(f"{prefix}: box extends outside the image")
            continue

        class_counts[class_id] += 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_root", nargs="?", default=".")
    parser.add_argument("--production", action="store_true")
    args = parser.parse_args()

    root = Path(args.dataset_root).expanduser().resolve()
    errors = []
    warnings = []

    thresholds_path = root / "quality_thresholds.yaml"
    thresholds = yaml.safe_load(thresholds_path.read_text(encoding="utf-8"))
    min_images = thresholds["minimum_images"]
    min_boxes = thresholds["minimum_boxes_per_class"]
    min_side = int(thresholds["minimum_short_side_px"])
    near_error = int(thresholds["near_duplicate_error_distance"])
    near_warning = int(thresholds["near_duplicate_warning_distance"])

    yaml_path = root / "data.yaml"
    if not yaml_path.is_file():
        errors.append(f"Missing {yaml_path}")
    else:
        config = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
        if normalize_names(config.get("names")) != EXPECTED_NAMES:
            errors.append("data.yaml class names or order are incorrect")
        if config.get("nc") != 8:
            errors.append("data.yaml nc must be 8")
        expected_paths = {
            "train": "train/images",
            "val": "val/images",
            "test": "test/images",
        }
        for key, expected in expected_paths.items():
            actual = str(config.get(key, "")).replace("\\", "/").rstrip("/")
            if actual != expected:
                errors.append(
                    f"data.yaml {key} must be {expected!r}, found {actual!r}"
                )

    split_images = {}
    split_classes = {s: Counter() for s in SPLITS}
    all_infos = []
    image_key_to_path = {}

    for split in SPLITS:
        image_dir = root / split / "images"
        label_dir = root / split / "labels"

        if not image_dir.is_dir() or not label_dir.is_dir():
            errors.append(f"{split}: missing images/ or labels/ directory")
            continue

        images = sorted(
            p
            for p in image_dir.rglob("*")
            if p.is_file()
            and p.name != ".gitkeep"
            and p.suffix.lower() in IMAGE_EXTENSIONS
        )
        labels = sorted(
            p
            for p in label_dir.rglob("*.txt")
            if p.is_file() and p.name != ".gitkeep"
        )
        split_images[split] = len(images)

        if not images:
            errors.append(f"{split}: split is empty")

        image_map = {
            p.relative_to(image_dir).with_suffix("").as_posix(): p
            for p in images
        }
        label_map = {
            p.relative_to(label_dir).with_suffix("").as_posix(): p
            for p in labels
        }

        for key in sorted(set(image_map) - set(label_map)):
            errors.append(f"{split}: missing label for {image_map[key]}")
        for key in sorted(set(label_map) - set(image_map)):
            errors.append(f"{split}: orphan label {label_map[key]}")

        for key in sorted(set(image_map) & set(label_map)):
            global_key = f"{split}/{key}"
            image_key_to_path[global_key] = image_map[key]
            info = inspect_image(
                image_map[key], split, errors, warnings, min_side
            )
            if info is not None:
                all_infos.append(info)
            validate_label(
                label_map[key], errors, split_classes[split]
            )

        for class_id, name in enumerate(EXPECTED_NAMES):
            if split_classes[split][class_id] == 0:
                errors.append(f"{split}: class {class_id} {name} is absent")

        if len(images) < int(min_images[split]):
            message = (
                f"{split}: {len(images)} images is below project target "
                f"{min_images[split]}"
            )
            (errors if args.production else warnings).append(message)

        for class_id, name in enumerate(EXPECTED_NAMES):
            count = split_classes[split][class_id]
            if count < int(min_boxes[split]):
                message = (
                    f"{split}: {name} has {count} boxes, below project target "
                    f"{min_boxes[split]}"
                )
                (errors if args.production else warnings).append(message)

    # Exact duplicates.
    by_sha = defaultdict(list)
    for info in all_infos:
        by_sha[info.sha256].append(info)
    for matches in by_sha.values():
        if len(matches) > 1:
            splits = {m.split for m in matches}
            listed = ", ".join(str(m.path) for m in matches)
            if len(splits) > 1:
                errors.append(f"Exact duplicate across splits: {listed}")
            else:
                warnings.append(f"Exact duplicate inside one split: {listed}")

    # Near duplicates across splits only.
    for index, first in enumerate(all_infos):
        for second in all_infos[index + 1:]:
            if first.split == second.split:
                continue
            if first.sha256 == second.sha256:
                continue
            distance = hamming(first.dhash, second.dhash)
            pair = f"{first.path} <-> {second.path} (dHash {distance})"
            if distance <= near_error:
                errors.append(f"Likely near-duplicate across splits: {pair}")
            elif distance <= near_warning:
                warnings.append(f"Possible near-duplicate across splits: {pair}")

    # Manifest validation.
    manifest_path = root / "annotation_manifest.csv"
    if not manifest_path.is_file():
        errors.append(f"Missing {manifest_path}")
    else:
        rows = list(csv.DictReader(manifest_path.open(encoding="utf-8")))
        manifest_by_key = {}
        group_splits = defaultdict(set)

        required = [
            "filename",
            "vehicle_id",
            "photo_session_id",
            "country",
            "emirate",
            "source_owner",
            "source_type",
            "license_or_permission",
            "permission_evidence",
            "whole_car_verified",
            "uae_context_verified",
            "annotator",
            "reviewer",
            "review_status",
            "split",
            "group_id",
            "sha256",
        ]

        for row_number, row in enumerate(rows, start=2):
            prefix = f"annotation_manifest.csv row {row_number}"
            for field in required:
                if not (row.get(field) or "").strip():
                    errors.append(f"{prefix}: missing {field}")

            split = (row.get("split") or "").strip().lower()
            filename = (row.get("filename") or "").strip()
            key = f"{split}/{Path(filename).stem}"

            if split not in SPLITS:
                errors.append(f"{prefix}: invalid split {split!r}")
            if key in manifest_by_key:
                errors.append(f"{prefix}: duplicate manifest entry {key}")
            manifest_by_key[key] = row

            if (row.get("country") or "").strip().lower() not in {
                "uae",
                "united arab emirates",
            }:
                errors.append(f"{prefix}: country is not UAE")
            if (row.get("whole_car_verified") or "").strip().lower() != "yes":
                errors.append(f"{prefix}: whole_car_verified must be yes")
            if (row.get("uae_context_verified") or "").strip().lower() != "yes":
                errors.append(f"{prefix}: uae_context_verified must be yes")
            if (row.get("review_status") or "").strip().lower() != "approved":
                errors.append(f"{prefix}: review_status must be approved")

            expected_group = (
                (row.get("vehicle_id") or "").strip()
                + "|"
                + (row.get("photo_session_id") or "").strip()
            )
            if (row.get("group_id") or "").strip() != expected_group:
                errors.append(f"{prefix}: group_id does not match vehicle/session")
            group_splits[expected_group].add(split)

            path = root / split / "images" / filename
            if path.is_file():
                actual_sha = sha256_file(path)
                if (row.get("sha256") or "").strip() != actual_sha:
                    errors.append(f"{prefix}: sha256 does not match image")

        expected_manifest_keys = {
            f"{split}/{path.stem}"
            for split in SPLITS
            for path in (root / split / "images").iterdir()
            if path.is_file()
            and path.name != ".gitkeep"
            and path.suffix.lower() in IMAGE_EXTENSIONS
        }
        for key in sorted(expected_manifest_keys - set(manifest_by_key)):
            errors.append(f"Image is missing from annotation_manifest.csv: {key}")
        for key in sorted(set(manifest_by_key) - expected_manifest_keys):
            errors.append(f"Manifest row has no matching split image: {key}")

        for group_id, splits in sorted(group_splits.items()):
            if len(splits) > 1:
                errors.append(
                    f"Vehicle/session leakage: {group_id} appears in {sorted(splits)}"
                )

    print("\nDataset summary")
    print("---------------")
    for split in SPLITS:
        print(f"{split:<5}: {split_images.get(split, 0)} images")
        print(
            "       "
            + ", ".join(
                f"{name}={split_classes[split][i]}"
                for i, name in enumerate(EXPECTED_NAMES)
            )
        )

    if warnings:
        print("\nWarnings")
        print("--------")
        for warning in warnings:
            print("-", warning)

    if errors:
        print("\nFAILED")
        print("------")
        for error in errors:
            print("-", error)
        print(f"\nTotal errors: {len(errors)}")
        return 1

    print(
        "\nPASS: UAE whole-car dataset structure, annotations, provenance, "
        "group isolation, and duplicate checks passed."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
