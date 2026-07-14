"""
AutoValuate CV inference service (Hugging Face Space, CPU Basic) — Phase 3.

Wraps the fine-tuned YOLOv8 damage detector (exported to ONNX) behind a small
FastAPI app. The orchestration backend POSTs each photo to /detect and gets back
per-damage detections, which the Aggregation agent merges into a Condition Score.

Pure onnxruntime + numpy + opencv — no torch — so it fits the free CPU tier.
Drop the trained weights at model/best.onnx (produced by notebook 02) and the
service serves them; until then /detect reports model_loaded=false honestly.
"""
from __future__ import annotations

import base64
import io
import os
from functools import lru_cache
from pathlib import Path

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel

MODEL_PATH = Path(__file__).with_name("model") / "best.onnx"
IMGSZ = 640
CONF_THRES = 0.35
IOU_THRES = 0.45
CLASSES = ["dent", "scratch", "crack", "glass_shatter", "lamp_broken", "tire_flat", "punctured", "missing_part"]

app = FastAPI(title="AutoValuate CV — damage detector", version="1.0.0")


class DetectRequest(BaseModel):
    image: str  # data URI, raw base64, or http(s) URL


@lru_cache(maxsize=1)
def _session():
    import onnxruntime as ort
    if not MODEL_PATH.exists():
        return None
    return ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])


def _load_image(spec: str) -> np.ndarray:
    """Return an RGB uint8 array from a data URI, raw base64, or URL."""
    from PIL import Image
    if spec.startswith("http://") or spec.startswith("https://"):
        import httpx
        data = httpx.get(spec, timeout=20).content
    else:
        if spec.startswith("data:"):
            spec = spec.split(",", 1)[1]
        data = base64.b64decode(spec)
    img = Image.open(io.BytesIO(data)).convert("RGB")
    return np.asarray(img)


def _letterbox(img: np.ndarray, size: int = IMGSZ):
    h, w = img.shape[:2]
    r = size / max(h, w)
    nh, nw = int(round(h * r)), int(round(w * r))
    import cv2
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)
    canvas = np.full((size, size, 3), 114, np.uint8)
    canvas[:nh, :nw] = resized
    return canvas, r, (nh, nw)


def _nms(boxes: np.ndarray, scores: np.ndarray, iou_thres: float) -> list[int]:
    """Pure-numpy NMS. boxes as [x1,y1,x2,y2]."""
    if len(boxes) == 0:
        return []
    x1, y1, x2, y2 = boxes.T
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1)
        h = np.maximum(0.0, yy2 - yy1)
        inter = w * h
        iou = inter / (areas[i] + areas[order[1:]] - inter + 1e-9)
        order = order[1:][iou <= iou_thres]
    return keep


def _detect(img: np.ndarray) -> list[dict]:
    sess = _session()
    lb, r, (nh, nw) = _letterbox(img)
    x = lb.astype(np.float32).transpose(2, 0, 1)[None] / 255.0
    out = sess.run(None, {sess.get_inputs()[0].name: x})[0]  # (1, 4+nc, N)
    pred = np.squeeze(out, 0).T                               # (N, 4+nc)
    boxes_xywh, scores_all = pred[:, :4], pred[:, 4:]
    cls_ids = scores_all.argmax(1)
    confs = scores_all.max(1)
    m = confs > CONF_THRES
    boxes_xywh, cls_ids, confs = boxes_xywh[m], cls_ids[m], confs[m]
    if len(boxes_xywh) == 0:
        return []
    cx, cy, w, h = boxes_xywh.T
    xyxy = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], 1)

    dets: list[dict] = []
    H, W = img.shape[:2]
    for c in np.unique(cls_ids):
        idx = np.where(cls_ids == c)[0]
        keep = _nms(xyxy[idx], confs[idx], IOU_THRES)
        for k in keep:
            j = idx[k]
            x1, y1, x2, y2 = xyxy[j] / r                      # undo letterbox scale
            dets.append({
                "label": CLASSES[int(c)],
                "confidence": round(float(confs[j]), 4),
                # normalized [0,1] box in original-image coords, clamped
                "box": [round(float(np.clip(x1 / W, 0, 1)), 4), round(float(np.clip(y1 / H, 0, 1)), 4),
                        round(float(np.clip(x2 / W, 0, 1)), 4), round(float(np.clip(y2 / H, 0, 1)), 4)],
            })
    dets.sort(key=lambda d: -d["confidence"])
    return dets


@app.get("/")
def root():
    return {"service": "AutoValuate CV", "model_loaded": _session() is not None, "classes": CLASSES}


@app.get("/health")
def health():
    return {"status": "healthy", "model_loaded": _session() is not None}


@app.post("/detect")
def detect(req: DetectRequest):
    if _session() is None:
        return {"model_loaded": False, "detections": [],
                "note": "best.onnx not present yet — CV model still training (Phase 2)."}
    try:
        img = _load_image(req.image)
    except Exception as e:
        return {"model_loaded": True, "detections": [], "error": f"could not decode image: {e}"}
    return {"model_loaded": True, "detections": _detect(img)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 7860)))
