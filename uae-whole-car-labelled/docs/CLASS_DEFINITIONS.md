# Exact annotation definitions

Use these definitions consistently across all annotators and reviewers.

## 0 — `dent`

A visible inward or outward deformation of a body panel or vehicle part.

Include:

- Depressed or buckled metal/plastic.
- Local shape deformation with intact or damaged paint.
- Creases caused by impact.

Exclude:

- Normal body contours.
- Reflections and shadows.
- Surface-only scratches without deformation.

Draw a tight box around the visibly deformed region.

## 1 — `scratch`

A visible linear or irregular abrasion, scrape, or cut in the painted surface.

Include:

- Paint scratches.
- Scuff marks with clear surface damage.
- Long scrape marks.

Exclude:

- Reflections.
- Dirt streaks.
- Panel gaps.
- Cracks through the material.

Separate clearly disconnected scratches into separate boxes.

## 2 — `crack`

A visible fracture in a non-glass vehicle material, such as a bumper, body panel,
trim, or plastic component.

Include:

- Split or fractured bumper plastic.
- Cracked body panel or trim.
- Clearly visible fracture line.

Exclude:

- Windshield/window damage; use `glass_shatter`.
- Surface scratches.
- Panel seams.

## 3 — `glass_shatter`

Cracked, shattered, broken, or missing vehicle glass.

Include:

- Spider-web windshield cracks.
- Shattered side or rear windows.
- A broken glass pane with missing fragments.

Draw a box around the damaged glass region. If damage spans most of one pane, box
the affected pane.

## 4 — `lamp_broken`

A visibly damaged headlamp, tail lamp, indicator, fog lamp, or lamp housing.

Include:

- Broken lens.
- Cracked lamp housing.
- Missing lens with the lamp assembly still identifiable.
- Lamp assembly visibly crushed.

Exclude:

- A lamp that is merely switched off.
- Reflections.
- Minor haze or normal ageing.

## 5 — `tire_flat`

A tyre visibly deflated, collapsed, unseated, or resting abnormally on the rim.

Box the complete affected tyre.

Exclude:

- Perspective that only makes a tyre look narrow.
- Normal low-profile tyres.
- A hidden tyre where flatness cannot be confirmed.

## 6 — `punctured`

A visible puncture, cut, hole, embedded object, or sidewall rupture.

Box the local puncture/cut region.

When a puncture is visible and the tyre is also visibly flat, annotate:

- The local puncture as `punctured`.
- The complete affected tyre as `tire_flat`.

## 7 — `missing_part`

A vehicle component is visibly absent from the location where it should be.

Examples:

- Missing mirror.
- Missing bumper.
- Missing grille.
- Missing trim.
- Missing lamp assembly.
- Missing body panel section.

Box the region where the component should be, using visible mounting edges and
surrounding geometry.

Do not use this class for an object that is present but only cracked or dented.

## Multi-label rule

Annotate every independently visible supported damage. Overlapping boxes are
allowed when they represent different visual facts, such as a puncture inside a
flat tyre.

## Uncertain cases

Do not guess. Mark the image for review in the manifest and keep
`review_status` other than `approved` until a senior reviewer decides.
