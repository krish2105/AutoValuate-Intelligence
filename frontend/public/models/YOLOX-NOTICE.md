# Third-party model notice — `yolox_nano.onnx`

`yolox_nano.onnx` in this directory is **not** our model. It is redistributed under the terms
below, and this notice exists to satisfy Apache-2.0 §4(d).

| | |
|---|---|
| **Model** | YOLOX-Nano (COCO, 80 classes) |
| **Upstream** | [Megvii-BaseDetection/YOLOX](https://github.com/Megvii-BaseDetection/YOLOX) |
| **Exact artifact** | `yolox_nano.onnx` from release [`0.1.1rc0`](https://github.com/Megvii-BaseDetection/YOLOX/releases/tag/0.1.1rc0) |
| **SHA-256** | `c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d` |
| **Size** | 3.5 MB · input `[1,3,416,416]` · output `[1,3549,85]` |
| **Copyright** | Copyright (c) 2021-2022 Megvii Inc. All rights reserved. |
| **Licence** | Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0 |
| **Modifications** | **None.** Redistributed byte-for-byte as published upstream. |

## Why this model, specifically

This is a **licence decision as much as a technical one.** The damage detector
(`best.onnx`) is YOLOv8-derived and therefore **AGPL-3.0**, which is why the project cannot
currently be sold as closed-source software (see [`docs/LICENSING.md`](../../../docs/LICENSING.md)).

Reaching for YOLOv8n here — the obvious choice, and the same toolchain — would have added a
**second** AGPL-encumbered model, meaning a future commercial pivot would require replacing two
models instead of one. YOLOX is Apache-2.0 (Megvii, not Ultralytics), so this component imposes
no new copyleft obligation and the licensing problem stays exactly the size it already was.

## What it is used for

Capture-quality coaching only — locating the vehicle in a photo so the app can tell the user
"step back", "the car is cut off", or "too blurry" before that photo reaches the damage scan.

**It never contributes to a valuation or a damage score.** It lives outside the scoring path in
`lib/cv/capture-quality.ts`, runs in its own inference session, and its output is advisory to the
user only — so it cannot affect the deterministic score or the browser↔backend scoring parity.
