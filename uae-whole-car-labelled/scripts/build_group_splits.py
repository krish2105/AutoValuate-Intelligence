#!/usr/bin/env python3
"""Create deterministic vehicle/session-safe train, val, and test splits."""

from __future__ import annotations

import argparse
import csv
import hashlib
import math
import random
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
CLASS_COUNT = 8
SPLITS = ("train", "val", "test")
TARGET = {"train": 0.70, "val": 0.15, "test": 0.15}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_label(path: Path) -> Counter:
    counts = Counter()
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        raise ValueError(f"{path}: positive image has an empty label")
    for line_number, line in enumerate(text.splitlines(), start=1):
        parts = line.split()
        if len(parts) != 5:
            raise ValueError(f"{path}:{line_number}: expected 5 values")
        class_id = int(float(parts[0]))
        if not 0 <= class_id < CLASS_COUNT:
            raise ValueError(f"{path}:{line_number}: invalid class {class_id}")
        counts[class_id] += 1
    return counts


def clear_split(root: Path, split: str) -> None:
    for kind in ("images", "labels"):
        folder = root / split / kind
        folder.mkdir(parents=True, exist_ok=True)
        for path in folder.iterdir():
            if path.name == ".gitkeep":
                continue
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_root", nargs="?", default=".")
    parser.add_argument("--seed", type=int, default=20260719)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args()

    root = Path(args.dataset_root).expanduser().resolve()
    image_dir = root / "incoming" / "images"
    label_dir = root / "incoming" / "labels"
    manifest_path = root / "incoming_manifest.csv"

    errors = []
    if not image_dir.is_dir():
        errors.append(f"Missing {image_dir}")
    if not label_dir.is_dir():
        errors.append(f"Missing {label_dir}")
    if not manifest_path.is_file():
        errors.append(f"Missing {manifest_path}")
    if errors:
        print("\n".join(errors))
        return 1

    rows = list(csv.DictReader(manifest_path.open(encoding="utf-8")))
    if not rows:
        print("incoming_manifest.csv has no image rows")
        return 1

    images_by_name = {
        p.name: p
        for p in image_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    }
    labels_by_stem = {
        p.stem: p
        for p in label_dir.iterdir()
        if p.is_file() and p.suffix.lower() == ".txt"
    }

    records = []
    seen_names = set()

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
    ]

    for row_number, row in enumerate(rows, start=2):
        filename = (row.get("filename") or "").strip()
        prefix = f"manifest row {row_number}"

        if filename in seen_names:
            errors.append(f"{prefix}: duplicate filename {filename}")
            continue
        seen_names.add(filename)

        for field in required:
            if not (row.get(field) or "").strip():
                errors.append(f"{prefix}: missing {field}")

        if (row.get("country") or "").strip().lower() not in {
            "uae",
            "united arab emirates",
        }:
            errors.append(f"{prefix}: country must be United Arab Emirates")
        if (row.get("whole_car_verified") or "").strip().lower() != "yes":
            errors.append(f"{prefix}: whole_car_verified must be yes")
        if (row.get("uae_context_verified") or "").strip().lower() != "yes":
            errors.append(f"{prefix}: uae_context_verified must be yes")
        if (row.get("review_status") or "").strip().lower() != "approved":
            errors.append(f"{prefix}: review_status must be approved")

        image = images_by_name.get(filename)
        if image is None:
            errors.append(f"{prefix}: image not found: {filename}")
            continue
        label = labels_by_stem.get(Path(filename).stem)
        if label is None:
            errors.append(f"{prefix}: label not found for {filename}")
            continue

        try:
            class_counts = parse_label(label)
        except Exception as exc:
            errors.append(str(exc))
            continue

        group_id = (
            (row.get("vehicle_id") or "").strip()
            + "|"
            + (row.get("photo_session_id") or "").strip()
        )
        forced = (row.get("forced_split") or "").strip().lower()
        if forced and forced not in SPLITS:
            errors.append(f"{prefix}: forced_split must be train, val, or test")

        records.append(
            {
                "row": row,
                "image": image,
                "label": label,
                "group_id": group_id,
                "class_counts": class_counts,
                "forced_split": forced or None,
            }
        )

    unlisted = sorted(set(images_by_name) - seen_names)
    for filename in unlisted:
        errors.append(f"Image is missing from incoming_manifest.csv: {filename}")

    if errors:
        print("\nFAILED")
        for error in errors:
            print("-", error)
        return 1

    groups = defaultdict(list)
    for record in records:
        groups[record["group_id"]].append(record)

    group_stats = {}
    for group_id, items in groups.items():
        forced_values = {item["forced_split"] for item in items if item["forced_split"]}
        if len(forced_values) > 1:
            errors.append(
                f"Group {group_id} has conflicting forced_split values: {forced_values}"
            )
            continue
        class_counts = Counter()
        for item in items:
            class_counts.update(item["class_counts"])
        group_stats[group_id] = {
            "items": items,
            "images": len(items),
            "class_counts": class_counts,
            "forced_split": next(iter(forced_values), None),
        }

    if errors:
        print("\nFAILED")
        for error in errors:
            print("-", error)
        return 1

    total_images = len(records)
    total_classes = Counter()
    for record in records:
        total_classes.update(record["class_counts"])

    desired_images = {s: total_images * TARGET[s] for s in SPLITS}
    desired_classes = {
        s: {c: total_classes[c] * TARGET[s] for c in range(CLASS_COUNT)}
        for s in SPLITS
    }

    assigned = {}
    split_images = Counter()
    split_classes = {s: Counter() for s in SPLITS}

    def add_group(group_id: str, split: str) -> None:
        assigned[group_id] = split
        stat = group_stats[group_id]
        split_images[split] += stat["images"]
        split_classes[split].update(stat["class_counts"])

    # Forced assignments first.
    for group_id, stat in sorted(group_stats.items()):
        if stat["forced_split"]:
            add_group(group_id, stat["forced_split"])

    rng = random.Random(args.seed)
    remaining = [
        gid for gid in group_stats
        if gid not in assigned
    ]

    # Put groups containing rare classes first, then larger groups.
    def rarity_key(group_id: str):
        stat = group_stats[group_id]
        rarity = sum(
            stat["class_counts"][c] / max(total_classes[c], 1)
            for c in range(CLASS_COUNT)
        )
        return (-rarity, -stat["images"], rng.random())

    remaining.sort(key=rarity_key)

    for group_id in remaining:
        stat = group_stats[group_id]
        best_split = None
        best_score = None

        for split in SPLITS:
            new_images = split_images[split] + stat["images"]
            image_error = abs(new_images - desired_images[split]) / max(
                desired_images[split], 1
            )

            class_error = 0.0
            for class_id in range(CLASS_COUNT):
                new_count = (
                    split_classes[split][class_id]
                    + stat["class_counts"][class_id]
                )
                target = desired_classes[split][class_id]
                class_error += abs(new_count - target) / max(target, 1)

            # Slight penalty for overfilling a split early.
            overfill = max(0.0, new_images - desired_images[split]) / max(
                desired_images[split], 1
            )
            score = image_error + 0.35 * class_error + 0.75 * overfill

            if best_score is None or score < best_score:
                best_score = score
                best_split = split

        add_group(group_id, best_split)

    # Ensure each split has every class whenever the grouping allows it.
    for split in SPLITS:
        for class_id in range(CLASS_COUNT):
            if split_classes[split][class_id] > 0:
                continue

            candidates = []
            for group_id, donor in assigned.items():
                if donor == split:
                    continue
                stat = group_stats[group_id]
                if stat["class_counts"][class_id] == 0:
                    continue
                if (
                    split_classes[donor][class_id]
                    - stat["class_counts"][class_id]
                    <= 0
                ):
                    continue
                candidates.append(
                    (
                        stat["images"],
                        -stat["class_counts"][class_id],
                        group_id,
                        donor,
                    )
                )

            if not candidates:
                print(
                    f"Cannot place class {class_id} in {split} without breaking "
                    "group isolation. Add more independent vehicle/session groups."
                )
                return 1

            _, _, group_id, donor = sorted(candidates)[0]
            stat = group_stats[group_id]
            split_images[donor] -= stat["images"]
            split_classes[donor].subtract(stat["class_counts"])
            assigned[group_id] = split
            split_images[split] += stat["images"]
            split_classes[split].update(stat["class_counts"])

    if not args.no_reset:
        for split in SPLITS:
            clear_split(root, split)

    output_rows = []
    for group_id, split in sorted(assigned.items()):
        for record in group_stats[group_id]["items"]:
            image_dest = root / split / "images" / record["image"].name
            label_dest = root / split / "labels" / record["label"].name

            if image_dest.exists() or label_dest.exists():
                print(f"Destination exists: {image_dest} or {label_dest}")
                return 1

            shutil.copy2(record["image"], image_dest)
            shutil.copy2(record["label"], label_dest)

            out = dict(record["row"])
            out["split"] = split
            out["group_id"] = group_id
            out["sha256"] = sha256_file(image_dest)
            output_rows.append(out)

    fieldnames = list(rows[0].keys()) + ["split", "group_id", "sha256"]
    manifest_out = root / "annotation_manifest.csv"
    with manifest_out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output_rows)

    print("\nSplit summary")
    print("-------------")
    for split in SPLITS:
        print(
            f"{split:<5}: {split_images[split]:>5} images | "
            + " ".join(
                f"c{c}={split_classes[split][c]}"
                for c in range(CLASS_COUNT)
            )
        )
    print(f"\nWrote: {manifest_out}")
    print("PASS: vehicle/photo-session groups were kept isolated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
