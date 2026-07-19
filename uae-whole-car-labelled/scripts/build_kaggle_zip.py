#!/usr/bin/env python3
"""Validate and create the final private-Kaggle upload ZIP."""

from __future__ import annotations

import argparse
import subprocess
import sys
import zipfile
from pathlib import Path

EXCLUDE_PARTS = {"incoming", "__pycache__"}
EXCLUDE_NAMES = {".gitkeep"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_root", nargs="?", default=".")
    parser.add_argument("--production", action="store_true")
    parser.add_argument("--output")
    args = parser.parse_args()

    root = Path(args.dataset_root).expanduser().resolve()
    validator = root / "scripts" / "validate_uae_dataset.py"

    command = [sys.executable, str(validator), str(root)]
    if args.production:
        command.append("--production")

    result = subprocess.run(command)
    if result.returncode != 0:
        print("ZIP was not created because validation failed.")
        return result.returncode

    output = (
        Path(args.output).expanduser().resolve()
        if args.output
        else root.parent / "uae-whole-car-labelled-ready.zip"
    )

    if output.exists():
        output.unlink()

    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(root.rglob("*")):
            relative = path.relative_to(root)
            if any(part in EXCLUDE_PARTS for part in relative.parts):
                continue
            if path.name in EXCLUDE_NAMES:
                continue
            if path.is_file():
                archive.write(path, Path(root.name) / relative)

    print("Created:", output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
