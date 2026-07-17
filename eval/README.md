# Evaluation

Run everything: `./run_all.sh`

## What's here

| File | What it does |
|---|---|
| `unit_tests.py` | plain-assert suite (no pytest). Includes the CV class-order-vs-ONNX check and the confidence-is-not-severity contract. |
| `api_integration_test.py` | API surface |
| `e2e_test.py` | end-to-end pipeline |
| `faithfulness_eval.py` | report faithfulness/groundedness |
| `guardrails_test.py` | guardrail behaviour |
| `comparables_eval.py`, `retrieval_ablation.py`, `retrieval_tuning.py` | RAG retrieval |
| `model_improvement_study.py` | tabular valuation study (seeded 60/20/20) |
| `uncertainty_study.py` | interval calibration |
| `cv_baseline.json` | CV stack identity — regenerate with `python ../scripts/cv_baseline.py` |
| `benchmark_cases.json` | fixed test vehicles |

## CV evaluation — read this before quoting a number

`cv_eval_report.json` and `cv_train_summary.json` were **produced on Kaggle and copied in by
hand**. There is no script here that regenerates them, and there cannot be: the dataset
(~5.25 GB) is not in this repo and the notebooks hardcode `/kaggle/` paths.

So the CV numbers can be neither reproduced nor falsified from a clone. What they actually
measure is documented in [`../docs/CV_FINDINGS.md`](../docs/CV_FINDINGS.md) §4 — in short,
`mAP@0.5 = 0.732` is a **validation** subset score covering **6 of 8 classes**, measured on
`best.pt` rather than the shipped ONNX. It is not a held-out test result.

`run_all.sh` runs no CV accuracy evaluation, and neither does CI.

> This file previously advertised `ragas_eval.py` and `cv_map_eval.py`. **Neither ever
> existed.** Nothing here is planned-but-absent; if it's listed above, it's real.
