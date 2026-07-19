# Licensing — Option 1 taken (AGPL-3.0). Commercial use still needs a decision.

**Status: the repository now declares AGPL-3.0** (`LICENSE`, verbatim from gnu.org). That closes
the *undeclared-terms* gap below — the repo is public and ships AGPL-licensed weights, so this
documents an obligation that already applied rather than creating a new one.

**What is still open is the commercial path.** AGPL-3.0 does not forbid charging money; it
forbids withholding the corresponding source from network users. Monetising this as closed-source
SaaS still requires Option 2 or Option 3 below. Do not onboard a paying closed-source customer on
the strength of the `LICENSE` file alone.

Reversibility, stated honestly: you may relicense your *own* future code if the AGPL dependency
(the YOLOv8-derived weights) is removed — but versions already published under AGPL stay AGPL.

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

## Options (for the team / counsel to choose)

1. **Comply with AGPL-3.0** — license the application under AGPL and publish complete
   corresponding source. Simplest legally; has commercial implications.
   **← TAKEN (2026-07-19).** `LICENSE` added at the repo root. The source is already public,
   so the §13 network-source obligation is satisfied by the public repository.
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
