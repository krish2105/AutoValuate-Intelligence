# Annotation guidelines

## Whole-car framing requirement

The vehicle must be fully or substantially visible. A photo may still qualify when
a small edge is cropped, but it must preserve enough vehicle context to represent
real product framing.

Reject:

- Close-ups pasted onto a canvas.
- Synthetic stand-back borders.
- Crops showing only one damage patch.
- Screenshots containing UI chrome unless that matches production input.
- Images with unreadable compression or extreme blur.

## Box quality

- Draw tight boxes around visible damage.
- Do not include large areas of unaffected vehicle.
- Boxes must stay inside the image.
- Use one box per disconnected damage region.
- Do not label damage that is fully occluded.
- Do not infer hidden damage from accident context.

## Review process

Every approved image should have:

1. Initial annotation.
2. Independent review.
3. Corrected final label.
4. Completed provenance and permission fields.
5. Confirmed vehicle/session identifiers.
6. Confirmed UAE whole-car context.

## Recommended annotation audit

Randomly review at least:

- 100% of test images.
- 100% of rare-class images.
- 25% of train/validation images.
- Any image with more than five boxes.
- Any image marked uncertain by the annotator.
