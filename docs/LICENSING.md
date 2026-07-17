# Licensing — UNRESOLVED, needs a decision before any commercial use

**Status: escalated, not decided.** This is a legal question, not an engineering one, and it is
recorded here rather than resolved silently. Do not treat the current state as compliant.

## The issue

The shipped damage-detection model (`frontend/public/models/best.onnx`,
`cv-service/model/best.onnx`) declares, in its own ONNX metadata:

    license: AGPL-3.0 License (https://ultralytics.com/license)

It was produced by fine-tuning **Ultralytics YOLOv8**, which is **AGPL-3.0**. The repository
itself has **no `LICENSE` file**, so the project's own terms are undeclared.

## Why it matters for this product

AutoValuate is a **network-served (SaaS) application** — the exact case the AGPL's §13 ("Remote
Network Interaction") is written for. AGPL-3.0 generally requires that users who interact with
the software over a network be able to receive the **complete corresponding source**, including
modifications, under the AGPL. Two facts make this non-trivial here:

- The model runs **in the browser** (`onnxruntime-web`), so the AGPL-licensed weights are
  distributed to every user's device, not merely executed server-side.
- The product is intended to be **commercialised** (see the pricing page and the "SaaS" deck).

A permissive reading is not safe to assume. The obligation, if it applies, extends to the wider
application source, not just the model.

## Options (for the team / counsel to choose — not chosen here)

1. **Comply with AGPL-3.0** — license the application under AGPL and publish complete
   corresponding source. Simplest legally; has commercial implications.
2. **Obtain an Ultralytics Enterprise License** — Ultralytics sells a commercial license that
   removes the AGPL obligation. This is the intended path for closed commercial use.
3. **Replace the detector** with a model under a permissive license (e.g. Apache-2.0 / MIT
   weights and training code), retraining on data that is itself licensed for commercial use.

## What NOT to do

- Do not add a permissive `LICENSE` file to this repo while shipping AGPL weights — that would
  misrepresent the terms.
- Do not remove the license string from the ONNX metadata to "resolve" it. The obligation
  follows the weights, not the metadata field.

## Recommendation

Get a decision from whoever owns the commercial direction (and, ideally, brief legal review)
**before** onboarding a paying customer. Until then, this is an open compliance risk, disclosed.
