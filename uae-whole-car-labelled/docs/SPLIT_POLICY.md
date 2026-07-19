# Split policy

## Grouping unit

The minimum grouping unit is:

```text
vehicle_id + photo_session_id
```

All photographs from one group must stay in one split.

When the same vehicle is photographed in separate sessions, keep all sessions from
that vehicle in one split whenever practical. This prevents the model from seeing
the same paint, body shape, damage pattern, and background in training and test.

## Default split

```text
train: 70%
val:   15%
test:  15%
```

The builder balances image counts and class counts while preserving groups.

## Test isolation

The test split is permanent once metrics are reported.

Never:

- Move difficult test images into training.
- Tune augmentation using test performance.
- Copy test images into `damage-unified`.
- Copy test images into `framing-auxiliary`.
- Use transformed versions of test images in training.
