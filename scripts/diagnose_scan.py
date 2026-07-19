"""
Diagnose a single photo through the EXACT in-browser scan pipeline, printing what every stage
does — and specifically WHICH GATE discards each detection.

Why this exists
---------------
A catastrophically wrecked car scored 100/100 "no visible damage". When a scan returns zero
findings there is no way, from the UI, to tell these apart:
  (a) the model saw nothing at all               -> a recall failure, needs retraining
  (b) the model saw damage below the confidence gate -> a THRESHOLD problem, fixable today
  (c) preprocessing produced a garbage tensor    -> a pipeline bug
They demand completely different fixes, so guessing is expensive. This prints the evidence.

It mirrors frontend/lib/cv-browser.ts: same 4 tiles, same DECODE_FLOOR/CONF_THRES/TILE_CONF,
same glass gate. Numbers here should track what the browser does.

Usage:  python scripts/diagnose_scan.py <image> [--floor 0.05]
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "frontend" / "public" / "models" / "best.onnx"

CLASSES = ["dent", "scratch", "crack", "glass_shatter",
           "lamp_broken", "tire_flat", "punctured", "missing_part"]
IMGSZ = 640
# Mirrors cv-browser.ts
DECODE_FLOOR = 0.20
CONF_THRES = 0.35   # full-frame pass gate
TILE_CONF = 0.33    # tile pass gate, and the floor again in aggregation
GLASS_CONF = 0.55   # glass_shatter needs more confidence (reflection FPs)
MIN_AREA = 0.0008
TILE_REGIONS = [(0, 0, 1, 1), (0, 0, 1, 0.6), (0, 0.4, 0.6, 1), (0.4, 0.4, 1, 1)]
TILE_NAMES = ["full-frame", "top-half", "bottom-left", "bottom-right"]


def letterbox(img, size=IMGSZ):
    h, w = img.shape[:2]
    r = size / max(h, w)
    nw, nh = int(round(w * r)), int(round(h * r))
    canvas = np.full((size, size, 3), 114, np.uint8)
    canvas[:nh, :nw] = cv2.resize(img, (nw, nh))
    return canvas, r


def infer(sess, img, floor):
    canvas, ratio = letterbox(img)
    rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    t = np.transpose(rgb, (2, 0, 1))[None]
    out = sess.run([sess.get_outputs()[0].name], {sess.get_inputs()[0].name: t})[0][0]
    nc = out.shape[0] - 4
    scores = out[4:4 + nc]
    best_c, best_s = scores.argmax(axis=0), scores.max(axis=0)
    keep = best_s > floor
    dets = []
    h, w = img.shape[:2]
    for i in np.where(keep)[0]:
        cx, cy, bw, bh = out[0, i], out[1, i], out[2, i], out[3, i]
        x1 = max(0.0, (cx - bw / 2) / ratio / w)
        y1 = max(0.0, (cy - bh / 2) / ratio / h)
        x2 = min(1.0, (cx + bw / 2) / ratio / w)
        y2 = min(1.0, (cy + bh / 2) / ratio / h)
        dets.append((CLASSES[best_c[i]], float(best_s[i]), (x1, y1, x2, y2)))
    return sorted(dets, key=lambda d: -d[1])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--floor", type=float, default=0.05,
                    help="decode floor for DIAGNOSIS (lower than production to reveal near-misses)")
    args = ap.parse_args()

    img = cv2.imread(args.image)
    if img is None:
        print(f"could not read {args.image}")
        return 1
    H, W = img.shape[:2]
    print(f"image: {args.image}  {W}x{H}")
    print(f"production gates: decode>{DECODE_FLOOR}, full-frame>={CONF_THRES}, "
          f"tile>={TILE_CONF}, glass>={GLASS_CONF}\n")

    sess = ort.InferenceSession(str(MODEL), providers=["CPUExecutionProvider"])

    survivors, near_misses, total_raw = [], [], 0
    for (fx1, fy1, fx2, fy2), name in zip(TILE_REGIONS, TILE_NAMES):
        crop = img[int(fy1 * H):int(fy2 * H), int(fx1 * W):int(fx2 * W)]
        if crop.size == 0:
            continue
        dets = infer(sess, crop, args.floor)
        total_raw += len(dets)
        gate = CONF_THRES if name == "full-frame" else TILE_CONF
        best = {}
        for lbl, conf, _ in dets:
            best[lbl] = max(best.get(lbl, 0.0), conf)
        print(f"[{name}] {len(dets)} raw detections above {args.floor}")
        if best:
            for lbl, conf in sorted(best.items(), key=lambda x: -x[1]):
                effective = GLASS_CONF if lbl == "glass_shatter" else gate
                if conf >= effective:
                    verdict, bucket = "KEPT", survivors
                else:
                    verdict, bucket = f"DROPPED (needs >={effective})", near_misses
                bucket.append((lbl, conf, name))
                print(f"    {lbl:14} best conf {conf:.3f}   {verdict}")
        else:
            print("    (nothing at all — the model is blind to this crop)")
        print()

    print("=" * 72)
    if survivors:
        print(f"VERDICT: {len(survivors)} detection(s) survive the gates -> the scan SHOULD "
              f"report damage.")
        for lbl, conf, where in sorted(survivors, key=lambda x: -x[1]):
            print(f"  {lbl:14} {conf:.3f}  ({where})")
    elif near_misses:
        top = max(near_misses, key=lambda x: x[1])
        print("VERDICT: (b) THRESHOLD PROBLEM — the model DID see damage, the gates discarded it.")
        print(f"  best near-miss: {top[0]} at {top[1]:.3f} in {top[2]}, "
              f"gate is {TILE_CONF if top[2] != 'full-frame' else CONF_THRES}")
        print("  => lowering the gate would surface this, at the cost of false positives on")
        print("     clean cars. Re-run eval/cv_scoring.py after any change.")
    elif total_raw == 0:
        print("VERDICT: (a) RECALL FAILURE — the model produces NOTHING on this image, even at")
        print(f"  a decode floor of {args.floor}. No threshold change can fix this; it needs")
        print("  retraining on in-domain (UAE, whole-car) photos.")
    print("=" * 72)
    print("\nNOTE: zero detections is NOT evidence the car is undamaged. Measured recall is")
    print("0.690 overall (dent 0.525, crack 0.389) — this model misses roughly a third of")
    print("real damage, so a clean scan must never be reported as a clean car.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
