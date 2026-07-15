"""
In-process YOLOv8 damage detector (onnxruntime, no torch).

Runs the trained detector inside the backend when a Hugging Face CV Space isn't
available (the free HF tier is Static-only). Opt-in via ENABLE_LOCAL_CV=1 because
the ONNX session adds ~150 MB — fine locally or on a paid dyno, but the 512 MB
Render free tier keeps it off. Same decode/NMS as cv-service/app.py.
"""
from __future__ import annotations

import base64
import io
import os
from functools import lru_cache
from pathlib import Path

import numpy as np

MODEL_PATH = Path(__file__).resolve().parents[2] / "cv-service" / "model" / "best.onnx"
IMGSZ = 640
CONF_THRES = 0.35        # full-frame pass gate
TILE_CONF = 0.33         # tile-only pass gate
IOU_THRES = 0.45
CLASSES = ["dent", "scratch", "crack", "glass_shatter", "lamp_broken", "tire_flat", "punctured", "missing_part"]
# Full frame + top half + the two bottom quadrants (4 passes). Zooming into regions recovers
# small/localized damage a single 640² letterbox squashes away — the main recall lever, no
# retrain. Matched full+4-quadrants (5 passes) on real photos while ~20% faster; no blind region.
# (See frontend cv-browser TILE_REGIONS.)
TILE_REGIONS = [(0, 0, 1, 1), (0, 0, 1, 0.6), (0, 0.4, 0.6, 1), (0.4, 0.4, 1, 1)]
# glass_shatter is hallucinated on zoomed tiles (reflections); take it only from the full pass.
TILE_EXCLUDE = {"glass_shatter"}
# ...and even on the full pass it FPs on windshield reflections. Real shattered glass is reliably
# detected ≥0.75, so demand higher confidence for it to drop weaker reflection false positives.
GLASS_CONF = 0.55


def available() -> bool:
    return os.environ.get("ENABLE_LOCAL_CV", "").strip() in ("1", "true", "yes") and MODEL_PATH.exists()


@lru_cache(maxsize=1)
def _session():
    import onnxruntime as ort
    return ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])


def _load_image(spec: str) -> np.ndarray:
    from PIL import Image
    if spec.startswith("http://") or spec.startswith("https://"):
        import httpx
        data = httpx.get(spec, timeout=20).content
    else:
        if spec.startswith("data:"):
            spec = spec.split(",", 1)[1]
        data = base64.b64decode(spec)
    return np.asarray(Image.open(io.BytesIO(data)).convert("RGB"))


def _letterbox(img: np.ndarray, size: int = IMGSZ):
    import cv2
    h, w = img.shape[:2]
    r = size / max(h, w)
    nh, nw = int(round(h * r)), int(round(w * r))
    canvas = np.full((size, size, 3), 114, np.uint8)
    canvas[:nh, :nw] = cv2.resize(img, (nw, nh))
    return canvas, r


def _nms(boxes: np.ndarray, scores: np.ndarray, iou: float) -> list[int]:
    if len(boxes) == 0:
        return []
    x1, y1, x2, y2 = boxes.T
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]; keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]]); yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]]); yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1); h = np.maximum(0.0, yy2 - yy1)
        iou_ = (w * h) / (areas[i] + areas[order[1:]] - w * h + 1e-9)
        order = order[1:][iou_ <= iou]
    return keep


def _infer_region(img: np.ndarray, frac, min_conf: float) -> list[dict]:
    """Run the model on one crop of the image; return detections normalized to the FULL image."""
    sess = _session()
    H, W = img.shape[:2]
    sx, sy = int(frac[0] * W), int(frac[1] * H)
    ex, ey = int(frac[2] * W), int(frac[3] * H)
    crop = img[sy:ey, sx:ex]
    if crop.size == 0:
        return []
    cw, ch = ex - sx, ey - sy
    lb, r = _letterbox(crop)
    x = lb.astype(np.float32).transpose(2, 0, 1)[None] / 255.0
    out = np.squeeze(sess.run(None, {sess.get_inputs()[0].name: x})[0], 0).T  # (N, 4+nc)
    boxes, scores = out[:, :4], out[:, 4:]
    cls = scores.argmax(1); conf = scores.max(1)
    m = conf > min_conf
    boxes, cls, conf = boxes[m], cls[m], conf[m]
    if len(boxes) == 0:
        return []
    cx, cy, w, h = boxes.T
    xyxy = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], 1)
    dets = []
    for c in np.unique(cls):
        idx = np.where(cls == c)[0]
        for k in _nms(xyxy[idx], conf[idx], IOU_THRES):
            j = idx[k]
            bx = xyxy[j] / r  # back to crop pixels
            X1 = (sx + bx[0]) / W; Y1 = (sy + bx[1]) / H
            X2 = (sx + bx[2]) / W; Y2 = (sy + bx[3]) / H
            dets.append({
                "label": CLASSES[int(c)],
                "confidence": round(float(conf[j]), 4),
                "box": [round(float(np.clip(v, 0, 1)), 4) for v in (X1, Y1, X2, Y2)],
            })
    return dets


# ---- Weighted Box Fusion (better localization + agreement-boosted confidence) ----
WBF_IOU = 0.55
AGREE_BONUS = 0.05   # +conf per extra tile a box was seen in (independent-crop agreement)


def _iou1(a, b) -> float:
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / (ua + 1e-9)


def _wbf(dets: list[dict]) -> list[dict]:
    """
    Weighted Box Fusion over the tile passes. Unlike NMS (which keeps one box and discards the
    rest), WBF fuses a cluster of overlapping same-class boxes into a confidence-weighted average
    box — tighter localization — and boosts the fused confidence when several independent crops
    agree (genuine evidence the damage is real).
    """
    by_class: dict[str, list[dict]] = {}
    for d in dets:
        by_class.setdefault(d["label"], []).append(d)
    out: list[dict] = []
    for label, group in by_class.items():
        group = sorted(group, key=lambda d: -d["confidence"])
        clusters: list[dict] = []
        for d in group:
            hit = next((c for c in clusters if _iou1(c["box"], d["box"]) >= WBF_IOU), None)
            if hit is not None:
                hit["boxes"].append(d["box"]); hit["confs"].append(d["confidence"])
                wsum = sum(hit["confs"])
                hit["box"] = [sum(b[i] * c for b, c in zip(hit["boxes"], hit["confs"])) / wsum for i in range(4)]
            else:
                clusters.append({"box": list(d["box"]), "boxes": [d["box"]], "confs": [d["confidence"]]})
        for c in clusters:
            fused_conf = min(0.98, max(c["confs"]) + AGREE_BONUS * (len(c["confs"]) - 1))
            out.append({
                "label": label,
                "confidence": round(fused_conf, 4),
                "box": [round(float(np.clip(v, 0, 1)), 4) for v in c["box"]],
            })
    return out


# ---- Pixel-based severity head (grades damage from crop texture/shadow/extent) ----
SEV_W_AREA, SEV_W_GRAD, SEV_W_DARK = 0.42, 0.34, 0.24
SEV_GRAD_NORM, SEV_DARK_NORM, SEV_AREA_NORM = 0.16, 0.45, 0.14
SEV_CLASS_PRIOR = {"glass_shatter": 0.15, "missing_part": 0.20, "punctured": 0.15, "crack": 0.10, "lamp_broken": 0.08}


def _pixel_severity(img: np.ndarray, box) -> float:
    """
    0..1 severity from the detected crop's pixels — not its box size. Crumpled metal, cracks and
    scrapes raise gradient energy; deep dents, holes and voids raise the dark fraction; extent adds
    on top. Structural classes get a small prior. Resampled to 48×48 gray for scale invariance.
    """
    H, W = img.shape[:2]
    x1, y1, x2, y2 = int(box[0] * W), int(box[1] * H), int(box[2] * W), int(box[3] * H)
    x2, y2 = max(x2, x1 + 1), max(y2, y1 + 1)
    crop = img[y1:y2, x1:x2]
    if crop.size == 0:
        return 0.3
    from PIL import Image as _I
    g = (0.299 * crop[:, :, 0] + 0.587 * crop[:, :, 1] + 0.114 * crop[:, :, 2]).astype(np.uint8)
    g = np.asarray(_I.fromarray(g).resize((48, 48))).astype(np.float32) / 255.0
    gy, gx = np.gradient(g)
    grad = float(np.mean(np.sqrt(gx * gx + gy * gy)))
    dark = float(np.mean(g < 0.18))
    area = max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])
    raw = (SEV_W_AREA * min(1.0, area / SEV_AREA_NORM)
           + SEV_W_GRAD * min(1.0, grad / SEV_GRAD_NORM)
           + SEV_W_DARK * min(1.0, dark / SEV_DARK_NORM))
    return min(1.0, raw)


def severity_prior(label: str) -> float:
    return SEV_CLASS_PRIOR.get(label, 0.0)


def detect(image_spec: str) -> list[dict]:
    """
    Return [{label, confidence, box:[x1,y1,x2,y2] normalized}] for one image spec.

    Tiled inference (full + top-half + 2 bottom quadrants) → Weighted Box Fusion → a
    pixel-based severity (0..1) per detection graded from the crop's texture/shadow/extent.
    glass_shatter is taken only from the full pass (tiles hallucinate it). Each detection
    carries {label, confidence, box, sev}. Mirror of frontend cv-browser.detectImage.
    """
    img = _load_image(image_spec)
    all_dets: list[dict] = []
    for i, frac in enumerate(TILE_REGIONS):
        is_full = i == 0
        for d in _infer_region(img, frac, CONF_THRES if is_full else TILE_CONF):
            if not is_full and d["label"] in TILE_EXCLUDE:
                continue
            all_dets.append(d)
    dets = _wbf(all_dets)
    # Drop low-confidence glass_shatter (reflection false positives).
    dets = [d for d in dets if not (d["label"] == "glass_shatter" and d["confidence"] < GLASS_CONF)]
    for d in dets:
        d["sev"] = round(min(1.0, _pixel_severity(img, d["box"]) + severity_prior(d["label"])), 4)
    dets.sort(key=lambda d: -d["confidence"])
    return dets
