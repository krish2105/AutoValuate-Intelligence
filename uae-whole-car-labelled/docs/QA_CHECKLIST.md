# Final QA checklist

Before creating the Kaggle dataset:

```text
[ ] Every image is a real UAE whole-car photograph
[ ] Every image has written ML-use permission
[ ] Every image has a stable vehicle_id
[ ] Every image has a stable photo_session_id
[ ] Every image has a matching non-empty label file
[ ] All boxes use normalized YOLO coordinates
[ ] Exact eight-class ID order is unchanged
[ ] Every class exists in train, val, and test
[ ] No vehicle/session appears in more than one split
[ ] No exact duplicate appears across splits
[ ] Near-duplicate warnings were manually reviewed
[ ] Test images do not appear in other notebook inputs
[ ] 100% of test annotations were independently reviewed
[ ] Validator prints PASS
[ ] Dataset is uploaded as private
```
