#!/usr/bin/env python3
"""Generate a human-readable class and split report."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

NAMES = [
    "dent",
    "scratch",
    "crack",
    "glass_shatter",
    "lamp_broken",
    "tire_flat",
    "punctured",
    "missing_part",
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_root", nargs="?", default=".")
    args = parser.parse_args()
    root = Path(args.dataset_root).resolve()

    report = {"splits": {}}
    for split in ("train", "val", "test"):
        images = [
            p for p in (root / split / "images").iterdir()
            if p.is_file() and p.name != ".gitkeep"
        ]
        counts = Counter()
        for label in (root / split / "labels").glob("*.txt"):
            if label.name == ".gitkeep":
                continue
            for line in label.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    counts[int(float(line.split()[0]))] += 1

        report["splits"][split] = {
            "images": len(images),
            "boxes": {NAMES[i]: counts[i] for i in range(len(NAMES))},
        }

    output = root / "dataset-report.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(output)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
