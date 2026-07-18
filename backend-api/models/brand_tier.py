"""
Canonical brand-tier lookup — ONE definition, shared by training, inference and eval.

Why this module exists
----------------------
The luxury set was duplicated in three places (train_valuation.py, valuation_model.py via
the serialized bundle, and eval/model_improvement_study.py) and compared with an EXACT
string match. That silently mis-tiered a whole brand:

  * `MAKES` in scripts/scrape_comparables.py requests the Dubizzle URL slug "land-rover".
  * normalise() keeps the actor's OWN make field when present, and the actor emits human
    brand names — so rows land in the corpus as "land rover" (space), not "land-rover".
  * The luxury set contained only the hyphenated slug, so `"land rover" in LUXURY` was
    False and all 64 Land Rovers were tiered "mass" — a segment whose median price is
    ~2.6x the mass median, priced with the NARROWER mass conformal band. An over-confident
    interval on an identifiable group is exactly the failure Mondrian conformal exists to
    prevent.

"mercedes-benz" survived only by luck (that brand really is hyphenated). Any future make
whose URL slug differs from its brand name would hit the same bug.

Design
------
Normalize at COMPARISON time; never rewrite stored `make` values. `make` is a categorical
model input — rewriting it in the corpus would split one brand into two levels ("land
rover" and "land-rover"), invalidate the serialized encoder, and make things strictly
worse. Comparing on a normalized key fixes the tiering with no data migration and no
retrain required for the lookup to become correct.
"""
from __future__ import annotations

import re

# Brands priced as luxury. Keys are stored in canonical (hyphenated) form; make_key()
# maps any real-world spelling onto them, so "Land Rover" / "land rover" / "land-rover"
# all resolve identically.
LUXURY_KEYS = {
    "mercedes-benz",
    "mercedes-maybach",
    "bmw",
    "audi",
    "lexus",
    "porsche",
    "land-rover",
    "jaguar",
    "maserati",
    "bentley",
    "rolls-royce",
    "ferrari",
    "cadillac",
    "infiniti",
    "tesla",
    "gmc",
}


def make_key(make: object) -> str:
    """Canonical comparison key for a make: lowercase, whitespace/underscores -> hyphen.

    'Land Rover' -> 'land-rover'   'land rover' -> 'land-rover'   'BMW' -> 'bmw'
    Comparison only — never write this back to the corpus (see module docstring).
    """
    return re.sub(r"[\s_-]+", "-", str(make or "").strip().lower())


def is_luxury(make: object, luxury_keys: set[str] | None = None) -> bool:
    """True when `make` is a luxury brand, whatever its spelling.

    `luxury_keys` lets inference pass the set serialized in the model bundle, so a bundle
    trained with a different set still governs — while the SPELLING normalization applies
    either way. Falls back to this module's LUXURY_KEYS.
    """
    keys = LUXURY_KEYS if luxury_keys is None else {make_key(k) for k in luxury_keys}
    return make_key(make) in keys
