#!/usr/bin/env python3
"""Emit a reproducible record of the CV stack's identity.

Everything here is read from artifacts, never from docs — the ONNX metadata is the
authority on class order and input shape, not ARCHITECTURE.md. Re-run after any model
or config change and diff the JSON; an unexplained diff is a regression.

    python scripts/cv_baseline.py                 # print
    python scripts/cv_baseline.py -o eval/cv_baseline.json

`onnx` is not required: metadata comes from onnxruntime, which the backend already
depends on.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Artifacts whose identity the CV result depends on. A change to any of these can change
# a detection, so each is hashed rather than described.
MODELS = [
    "frontend/public/models/best.onnx",
    "cv-service/model/best.onnx",
]
EVAL_REPORTS = [
    "eval/cv_eval_report.json",
    "eval/cv_train_summary.json",
    "frontend/lib/eval/cv_eval_report.json",
    "frontend/lib/eval/cv_train_summary.json",
]


def sha256(path: Path) -> str | None:
    if not path.exists():
        return None
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def git(*args: str) -> str | None:
    try:
        out = subprocess.run(
            ["git", *args], cwd=ROOT, capture_output=True, text=True, timeout=30
        )
        return out.stdout.strip() if out.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


def onnx_identity(path: Path) -> dict:
    """Model metadata read from the artifact itself."""
    if not path.exists():
        return {"error": "missing"}
    try:
        import onnxruntime as ort
    except ImportError:
        return {"error": "onnxruntime not installed"}

    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    meta = sess.get_modelmeta()
    custom = dict(meta.custom_metadata_map)

    # Ultralytics stores names as a stringified Python dict: "{0: 'dent', 1: 'scratch'}".
    # Parse it into an index-ordered list so drift against code is directly comparable.
    classes = None
    if "names" in custom:
        pairs = re.findall(r"(\d+)\s*:\s*'([^']*)'", custom["names"])
        if pairs:
            classes = [name for _, name in sorted(pairs, key=lambda p: int(p[0]))]

    return {
        "producer_name": meta.producer_name,
        "graph_name": meta.graph_name,
        "custom_metadata": custom,
        "classes_from_model": classes,
        "inputs": [
            {"name": i.name, "shape": i.shape, "type": i.type} for i in sess.get_inputs()
        ],
        "outputs": [
            {"name": o.name, "shape": o.shape, "type": o.type} for o in sess.get_outputs()
        ],
        "onnxruntime_version": ort.__version__,
    }


def declared_versions() -> dict:
    """ONNX Runtime versions as *declared* per deployment target.

    These are deliberately reported separately: the browser, the backend, and this
    machine can each resolve a different ORT build, and a floating range means the
    inference engine is not pinned to the run that produced any evaluation number.
    """
    out: dict = {}

    pkg = ROOT / "frontend/package.json"
    if pkg.exists():
        deps = json.loads(pkg.read_text(encoding="utf-8")).get("dependencies", {})
        out["frontend_onnxruntime_web_declared"] = deps.get("onnxruntime-web")

    req = ROOT / "cv-service/requirements.txt"
    if req.exists():
        for line in req.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("onnxruntime"):
                out["cv_service_onnxruntime_declared"] = line.strip()
                break

    try:
        import onnxruntime as ort

        out["this_machine_onnxruntime"] = ort.__version__
    except ImportError:
        out["this_machine_onnxruntime"] = None

    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out", type=Path, help="write JSON here instead of stdout")
    args = ap.parse_args()

    models = {p: sha256(ROOT / p) for p in MODELS}
    distinct = {h for h in models.values() if h}

    record = {
        "git": {
            "commit": git("rev-parse", "HEAD"),
            "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
            # Empty string = clean tree. Recorded verbatim: a baseline taken against a
            # dirty tree is not reproducible, and hiding that would defeat the point.
            "working_tree_status": git("status", "--porcelain"),
        },
        "runtime": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "onnxruntime": declared_versions(),
        },
        "model_sha256": models,
        "model_copies_identical": len(distinct) == 1 and len(models) > 1,
        "model_identity": onnx_identity(ROOT / MODELS[0]),
        "eval_report_sha256": {p: sha256(ROOT / p) for p in EVAL_REPORTS},
    }

    text = json.dumps(record, indent=2, sort_keys=True) + "\n"
    if args.out:
        args.out.write_text(text, encoding="utf-8")
        print(f"wrote {args.out}", file=sys.stderr)
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
