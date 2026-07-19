# Notebooks (Kaggle, offline training + EDA)

- `01_cv_data_prep.ipynb`
- `02_yolov8_finetune_cardd_vehide.ipynb`
- `03_cv_eval_mAP.ipynb`
- `04_valuation_eda.ipynb`
- `05_xgboost_valuation_train.ipynb`
- `06_shap_explainability.ipynb`

Created in Phases 1, 2, 4.

## 09 — Retrain for framing invariance

`09_yolo_framing_invariance_retrain.ipynb` — the fix for the measured instability where a **3%
crop swings the condition score 47 points** and flips the reported damage class
(`missing_part` 0.28 severity -> `lamp_broken` 0.07). See `docs/CV_FINDINGS.md`.

Targets the root cause: the model trained on CarDD/VehiDE **close-up crops** but users upload
**whole-car wide shots**. Adds zoom-out augmentation (synthesises the wide regime), clean-car
negatives (kills the `tire_flat` 0.77 hallucination on normal wheels), an honest held-out TEST
split, and **stability as the deciding metric** — mAP barely moves even when the real problem is
fixed, because it is measured on the close-ups the model was always good at.

Run it only with GPU. Do not ship a model that fails the exit gates in the final cell.
