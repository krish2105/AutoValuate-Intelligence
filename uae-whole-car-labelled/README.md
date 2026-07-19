# UAE whole-car labelled damage dataset

This package creates the exact Kaggle input expected by the corrected
framing-invariance notebook.

## Final dataset structure

```text
uae-whole-car-labelled/
├── data.yaml
├── train/
│   ├── images/
│   └── labels/
├── val/
│   ├── images/
│   └── labels/
└── test/
    ├── images/
    └── labels/
```

The package also contains manifests, annotation-tool configurations, split
automation, duplicate/leakage checks, a strict validator, and a Kaggle ZIP builder.

## What is intentionally not included

No scraped auction or marketplace photographs are included. A valid UAE production
dataset requires real photographs that your organisation owns or is authorised to
use for machine learning. Public web research did not identify a ready-to-use,
openly licensed UAE whole-car damage dataset with this exact eight-class taxonomy.

Putting unrelated, non-UAE, copyrighted, synthetic, or guessed-label images into
this dataset would make the UAE-only test metrics misleading.

## Exact class order

```text
0 dent
1 scratch
2 crack
3 glass_shatter
4 lamp_broken
5 tire_flat
6 punctured
7 missing_part
```

Never reorder these IDs.

## End-to-end workflow

### 1. Acquire authorised UAE photographs

Use your blocked photo pipeline, your own field collection, insurer/workshop
partners, or another source for which you have written ML-training permission.

Each photo should:

- Be captured in the UAE.
- Show the whole vehicle or nearly the whole vehicle.
- Match real product camera, lighting, compression, and marketplace conditions.
- Contain at least one visible supported damage type.
- Have a stable `vehicle_id` and `photo_session_id`.
- Have clear provenance and permission evidence.

Do not use adjacent video frames as independent examples.

### 2. Place raw material in `incoming/`

```text
incoming/images/car_0001.jpg
incoming/labels/car_0001.txt
```

Every image must have a matching YOLO label file.

Fill one row per image in `incoming_manifest.csv`.

Required review values:

```text
country=United Arab Emirates
whole_car_verified=yes
uae_context_verified=yes
review_status=approved
```

### 3. Annotate

Use the definitions in `docs/CLASS_DEFINITIONS.md`.

YOLO format:

```text
class_id center_x center_y width height
```

Coordinates must be normalized to `0..1`.

The package includes Label Studio and CVAT class configurations under `docs/`.

### 4. Build group-safe splits

Install dependencies:

```bash
python -m pip install -r requirements.txt
```

Then run:

```bash
python scripts/build_group_splits.py .
```

The script keeps every vehicle/photo-session group in exactly one split and
writes `annotation_manifest.csv`.

Default target ratios are:

```text
train 70%
val   15%
test  15%
```

The group-aware split is deterministic.

### 5. Validate

```bash
python scripts/validate_uae_dataset.py .
```

For stricter project-size targets:

```bash
python scripts/validate_uae_dataset.py . --production
```

The validator checks:

- Exact class order and YAML paths.
- All train/val/test folders.
- Image/label filename matching.
- Readable images.
- Valid normalized bounding boxes.
- Non-empty positive labels.
- All eight classes represented in every split.
- Vehicle and photo-session leakage.
- Exact and near-duplicate images across splits.
- Manifest provenance, rights, UAE context, whole-car review, and approval.
- Recommended split sizes and per-class counts.
- Image resolution.

### 6. Check overlap against the other notebook inputs

```bash
python scripts/compare_against_other_inputs.py \
  . \
  --damage-unified /path/to/damage-unified \
  --framing-auxiliary /path/to/framing-auxiliary
```

Any exact overlap is an error. Near-overlap is reported for human review.

### 7. Build the Kaggle upload ZIP

```bash
python scripts/build_kaggle_zip.py .
```

This creates:

```text
uae-whole-car-labelled-ready.zip
```

Raw `incoming/` material is excluded from the upload ZIP.

### 8. Create the private Kaggle dataset

Edit `dataset-metadata.json` and replace the username placeholder.

Then:

```bash
kaggle datasets create -p . --private
```

Or upload the ready ZIP through the Kaggle website.

The training notebook expects:

```text
/kaggle/input/uae-whole-car-labelled/data.yaml
```

## Notebook behaviour

The ready training notebook:

- Merges only UAE `train` and `val` into model development.
- Leaves UAE `test` untouched.
- Reports UAE-only held-out test metrics separately.

Do not copy UAE test images into `damage-unified`, `framing-auxiliary`, or any
training folder.
