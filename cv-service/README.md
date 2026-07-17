# cv-service — model weights only (the service was removed)

This directory no longer hosts a service. It holds one artifact:

    model/best.onnx    the trained YOLOv8s damage detector (8 classes)

`backend-api/agents/cv_local.py` reads the weights from here (`MODEL_PATH`), and
`frontend/public/models/best.onnx` is a byte-identical copy the browser downloads. Both are
hashed and compared by `scripts/cv_baseline.py`.

## Why the service is gone

`cv-service/app.py` was a **third, silently different definition of "the detector"**. It
shared only the decode and NMS with the other two paths. It had no tiling, no Weighted Box
Fusion, no pixel-severity head, no `TILE_EXCLUDE`, no `GLASS_CONF` gate, and no
minimum-box-area filter. The same photo could therefore produce a different condition score
— and a different price — depending on whether an environment variable was set.

It was also already unreachable in the shipped configuration. Routing to it required *all*
of: `CV_SERVICE_URL` set, `ENABLE_LOCAL_CV` unset, no `client_condition` on the request,
and photos present. `compose.yaml` never defined the service. It was dead code that could
only ever wake up to disagree with the real detector.

There are now exactly two implementations, both governed by
[`docs/CV_INFERENCE_SPEC.md`](../docs/CV_INFERENCE_SPEC.md):

| Path | Implementation | When it runs |
|---|---|---|
| Browser (production) | `frontend/lib/cv-browser.ts` | every user scan — photos never leave the device |
| Server-side | `backend-api/agents/cv_local.py` | only for callers that POST photos with no `client_condition` |

## Weights

Produced by `notebooks/02_yolov8_finetune_cardd_vehide.ipynb`. Note that the reported mAP
was measured on `best.pt`, not on this exported ONNX — see the model-provenance section of
`docs/CV_INFERENCE_SPEC.md` for what is and isn't established about this artifact.

## If you need a remote inference service again

Do not re-add a parallel implementation. Either extract the post-processing into a module
both paths import, or hold the new service to the spec's conformance requirements before
routing any traffic to it.
