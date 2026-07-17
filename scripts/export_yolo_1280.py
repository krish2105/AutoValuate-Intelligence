"""
Re-export the damage detector at 1280 input — the CORRECT way to raise on-device resolution.

WHY THIS AND NOT FINER TILING
-----------------------------
The professor's suggestion (bigger inference window) is right: research shows imgsz 640 -> 1280
is a ~25% small-object gain, larger than any architecture tweak. But it CANNOT be done in the
browser code alone — the shipped ONNX has a FIXED input of [1,3,640,640] (dynamic=False), so a
1280 tensor is rejected outright. And we measured that finer *tiling* (zoomed crops) makes it
worse, not better: on a pristine car the model hallucinated tire_flat@0.80, crack, dent and
missing_part on zoomed panels/wheels (crops lose global context), tanking a clean car to 38/100
with no recall gain. So the real path is a higher-resolution MODEL, exported here.

BLOCKED WHERE: this must run on Kaggle (or wherever `best.pt` + the dataset live). `best.pt` is
gitignored and the CarDD+VehiDE data (~5.25 GB) is Kaggle-only, so it cannot run from a clone.

TWO OPTIONS (B is the real win; A is a quick, smaller gain)
----------------------------------------------------------
A) Quick re-export at 1280 (no retraining) — a modest gain; the model's features were learned
   at 640 so it is not tuned for 1280 detail:

       from ultralytics import YOLO
       YOLO("weights/best.pt").export(format="onnx", imgsz=1280, opset=12, nms=False, dynamic=False, simplify=True)

B) Fine-tune at 1280 for a few epochs, THEN export (recommended — this is what yields the ~25%):

       from ultralytics import YOLO
       m = YOLO("weights/best.pt")
       m.train(data="data.yaml", imgsz=1280, epochs=15, patience=6, batch=4, seed=42,
               project="runs", name="ft1280")     # batch small: 1280 uses ~4x the VRAM of 640
       m.export(format="onnx", imgsz=1280, opset=12, nms=False, dynamic=False, simplify=True)

AFTER EXPORT — the code changes (small, and they DO require a version bump)
--------------------------------------------------------------------------
1) Replace both best.onnx copies (frontend/public/models, cv-service/model) with the 1280 one.
   `scripts/cv-version.mjs` regenerates the content-addressed URL automatically at build.
2) frontend/lib/cv-browser.ts and backend cv_local.py: set IMGSZ = 1280.
3) Bump PREPROCESSING_VERSION / INFERENCE_CONFIG_VERSION and docs/CV_INFERENCE_SPEC.md together
   (input size is a §3 change, so a stale 640-condition must read as stale).
4) Re-run eval/unit_tests.py (class-order assert) and eval/cv_conformance.py, then re-CALIBRATE
   the thresholds on real photos — a 1280 model detects differently, so BASE_SEVERITY/CONF gates
   must be re-checked so clean cars stay high and wrecks stay low (same method as this session).

COST (measured expectation, from the research)
----------------------------------------------
- Accuracy: ~+25% on small damage (dents/scratches) — the classes that matter most here.
- Speed: ~2x slower per inference; ~4x the WASM memory (still under the 4 GB WASM cap).
  Consider the WebGPU execution provider (onnxruntime-web) on capable devices to claw the speed
  back — see docs/CV_INFERENCE_SPEC.md §5 on pinning the runtime.

This file is documentation + copy-paste commands, intentionally not runnable from the repo:
it has no access to best.pt or the dataset. Run the option-B block on Kaggle, then do the four
code steps above.
"""

if __name__ == "__main__":
    print(__doc__)
    print("This is a Kaggle-run recipe, not runnable here (needs best.pt + the dataset). "
          "See the module docstring.")
