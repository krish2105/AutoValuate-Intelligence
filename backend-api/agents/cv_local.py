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
CONF_THRES = 0.35
IOU_THRES = 0.45
CLASSES = ["dent", "scratch", "crack", "glass_shatter", "lamp_broken", "tire_flat", "punctured", "missing_part"]


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


def detect(image_spec: str) -> list[dict]:
    """Return [{label, confidence, box:[x1,y1,x2,y2] normalized}] for one image spec."""
    sess = _session()
    img = _load_image(image_spec)
    H, W = img.shape[:2]
    lb, r = _letterbox(img)
    x = lb.astype(np.float32).transpose(2, 0, 1)[None] / 255.0
    out = np.squeeze(sess.run(None, {sess.get_inputs()[0].name: x})[0], 0).T  # (N, 4+nc)
    boxes, scores = out[:, :4], out[:, 4:]
    cls = scores.argmax(1); conf = scores.max(1)
    m = conf > CONF_THRES
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
            bx = xyxy[j] / r
            dets.append({
                "label": CLASSES[int(c)],
                "confidence": round(float(conf[j]), 4),
                "box": [round(float(np.clip(bx[0] / W, 0, 1)), 4), round(float(np.clip(bx[1] / H, 0, 1)), 4),
                        round(float(np.clip(bx[2] / W, 0, 1)), 4), round(float(np.clip(bx[3] / H, 0, 1)), 4)],
            })
    dets.sort(key=lambda d: -d["confidence"])
    return dets
