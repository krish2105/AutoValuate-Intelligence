"""
Intake agent (Phase 6): validate + normalize the incoming valuation request.

Rejects nonsense early (bad year/mileage, missing make/model) so downstream
agents only ever see clean inputs. Pure validation — no model calls.
"""
from __future__ import annotations

from typing import Any

REFERENCE_YEAR = 2026
KNOWN_SPECS = {"GCC", "American", "European", "Japanese", "Canadian", "Korean", "Chinese", "Other"}


class IntakeError(ValueError):
    pass


def validate(payload: dict[str, Any]) -> dict[str, Any]:
    v = dict(payload)

    make = str(v.get("make", "")).strip().lower()
    model = str(v.get("model", "")).strip().lower()
    if not make or not model:
        raise IntakeError("make and model are required")

    try:
        year = int(v["year"])
    except (KeyError, ValueError, TypeError):
        raise IntakeError("year is required and must be an integer")
    if not (1980 <= year <= REFERENCE_YEAR):
        raise IntakeError(f"year must be between 1980 and {REFERENCE_YEAR}")

    try:
        km = float(v["kilometers"])
    except (KeyError, ValueError, TypeError):
        raise IntakeError("kilometers is required and must be a number")
    if not (0 <= km <= 800_000):
        raise IntakeError("kilometers must be between 0 and 800,000")

    spec = str(v.get("regionalSpecs", "GCC")).strip().title()
    if spec not in KNOWN_SPECS:
        spec = "Other"

    photos = v.get("photos", []) or []
    if not isinstance(photos, list):
        raise IntakeError("photos must be a list of image URLs or base64 strings")
    if len(photos) > 8:
        raise IntakeError("at most 8 photos are supported")

    clean = {
        "make": make,
        "model": model,
        "year": year,
        "kilometers": km,
        "age": max(0, REFERENCE_YEAR - year),
        "bodyType": str(v.get("bodyType", "")).strip() or None,
        "transmissionType": str(v.get("transmissionType", "Automatic")).strip(),
        "fuelType": str(v.get("fuelType", "Petrol")).strip(),
        "regionalSpecs": spec,
        "noOfCylinders": v.get("noOfCylinders"),
        "city": str(v.get("city", "Dubai")).strip(),
        "sellerType": str(v.get("sellerType", "Owner")).strip(),
        "photos": photos,
    }
    return clean
