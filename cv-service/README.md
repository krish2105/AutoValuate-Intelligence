---
title: AutoValuate CV
emoji: 🚗
colorFrom: yellow
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# AutoValuate CV — vehicle damage detector

FastAPI + onnxruntime service wrapping a YOLOv8-small model fine-tuned on CarDD + VehiDE
(8 damage classes: dent, scratch, crack, glass_shatter, lamp_broken, tire_flat, punctured,
missing_part). Runs CPU-only (no torch) so it fits the free CPU Basic tier.

## API

- `GET /health` → `{status, model_loaded}`
- `GET /` → service info + class list
- `POST /detect` with `{"image": "<data-uri | base64 | https URL>"}` →
  `{"model_loaded": true, "detections": [{"label", "confidence", "box":[x1,y1,x2,y2]}]}`
  (box is normalized to [0,1] in original-image coordinates)

## Weights

Place the exported model at `model/best.onnx` (produced by `notebooks/02_yolov8_finetune_cardd_vehide.ipynb`).
Until then `/detect` returns `model_loaded: false` honestly rather than faking detections.

Deployed automatically from the monorepo's `cv-service/` via `.github/workflows/deploy-cv-space.yml`.
