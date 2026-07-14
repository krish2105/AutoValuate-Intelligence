# Data

`raw/` and `processed/` are **gitignored** — nothing large is committed. Reproduce everything below with the Kaggle CLI + the prep script (both tracked in git).

## Datasets

### Tabular (valuation + comparables) — downloaded & prepped locally
| Dataset | Kaggle ref | Role |
|---|---|---|
| UAE Used Car Prices & Features (10K listings) | `alikalwar/uae-used-car-prices-and-features-10k-listings` | **Primary** — valuation training + comparables index |
| UAE CAR Used Dataset (DriveArabia spec guide) | `owaiskhan9654/uae-car-used-dataset` | Optional spec enrichment (power/torque/fuel econ) |

> See `DECISIONS.md` ADR-009 for why the primary set differs from the master prompt's named dataset.

### Computer vision (damage detection) — NOT downloaded locally; used on Kaggle
| Dataset | Kaggle ref | Format |
|---|---|---|
| CarDD (YOLO-annotated) | `gabrielfcarvalho/cardd-with-yolo-annotations-images-labels` | YOLO, 6 classes, ~3 GB |
| VehiDE | `hendrichscullen/vehide-dataset-automatic-vehicle-damage-detection` | COCO, ~2.25 GB |

See `DECISIONS.md` ADR-010 — these are unified on Kaggle via `notebooks/01_cv_data_prep.ipynb`.

## Reproduce

```bash
# Auth: put kaggle.json in ~/.kaggle/ (chmod 600), then:
pip install kaggle pandas pyarrow

# Tabular (small, ~2 MB):
kaggle datasets download -d alikalwar/uae-used-car-prices-and-features-10k-listings -p data/raw/alt --unzip
python data/prepare_tabular.py
# -> data/processed/listings_clean.parquet, comparables.csv, prep_report.json
```

CV datasets: attach the two Kaggle refs above to a Kaggle notebook and run `notebooks/01_cv_data_prep.ipynb` there.
