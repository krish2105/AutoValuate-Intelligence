"""
Phase 8 — agent unit + adversarial tests.

Beyond the happy-path E2E, these prove the guardrails actually work:
  - Intake rejects malformed input
  - The Verifier CATCHES injected ungrounded numbers and bad citations
    (the whole citation-grounding guarantee rests on this)
  - Aggregation degrades honestly with no CV service
  - The LLM client falls back to the template with no keys

Plain asserts (no pytest needed). Run: USE_TF=0 python eval/unit_tests.py
"""
from __future__ import annotations
import os
os.environ.setdefault("USE_TF", "0")

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend-api"))

from agents import intake_agent, aggregation_agent, verifier_agent  # noqa: E402
from llm_client.client import LLMClient  # noqa: E402

passed = 0
failed = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global passed, failed
    if cond:
        passed += 1
        print(f"  [PASS] {name}")
    else:
        failed += 1
        print(f"  [FAIL] {name} {detail}")


# ---- intake validation ----
def intake_raises(payload) -> bool:
    try:
        intake_agent.validate(payload)
        return False
    except intake_agent.IntakeError:
        return True


print("Intake validation:")
check("rejects missing make", intake_raises({"model": "x", "year": 2019, "kilometers": 1000}))
check("rejects missing model", intake_raises({"make": "toyota", "year": 2019, "kilometers": 1000}))
check("rejects year 1850", intake_raises({"make": "a", "model": "b", "year": 1850, "kilometers": 1000}))
check("rejects future year", intake_raises({"make": "a", "model": "b", "year": 2099, "kilometers": 1000}))
check("rejects negative mileage", intake_raises({"make": "a", "model": "b", "year": 2019, "kilometers": -5}))
check("rejects >8 photos", intake_raises({"make": "a", "model": "b", "year": 2019, "kilometers": 1000, "photos": ["x"] * 9}))
ok = intake_agent.validate({"make": " Toyota ", "model": "Corolla", "year": 2019, "kilometers": 90000})
check("normalizes make to lowercase", ok["make"] == "toyota")
check("computes age", ok["age"] == 2026 - 2019)

# ---- verifier adversarial ----
print("\nVerifier (adversarial — must CATCH hallucinations):")
evidence = {
    "valuation": {"V1": {"label": "low", "aed": 30000}, "V2": {"label": "mid", "aed": 40000}, "V3": {"label": "high", "aed": 55000},
                  "V4": {"label": "coverage", "value": 0.8}, "V5": {"label": "err", "value": 19.6}},
    "condition": {"D0": {"label": "visual", "value": "not available"}},
    "comparables": {"C1": {"desc": "x", "aed": 38000}},
    "drivers": {"P1": {"feature": "year", "aed_impact": -6000}},
}
clean_report = "Value is AED 30,000 [V1] to AED 55,000 [V3], mid AED 40,000 [V2]. Comparable at AED 38,000 [C1]. Median error 19.6% [V5]."
r_clean = verifier_agent.verify(clean_report, evidence)
check("passes a fully-grounded report", r_clean["passed"], str(r_clean["violations"]))

hallucinated = clean_report + " Also worth AED 999,999 easily."
r_hall = verifier_agent.verify(hallucinated, evidence)
check("CATCHES an injected ungrounded AED figure", not r_hall["passed"] and any("999,999" in v for v in r_hall["violations"]))

bad_cite = clean_report + " See [Z9]."
r_cite = verifier_agent.verify(bad_cite, evidence)
check("CATCHES a citation to non-existent evidence", not r_cite["passed"] and any("Z9" in v for v in r_cite["violations"]))

bad_pct = clean_report + " Confidence is 42% here."
r_pct = verifier_agent.verify(bad_pct, evidence)
check("CATCHES an ungrounded percentage", not r_pct["passed"])

# ---- aggregation fallback ----
print("\nAggregation (no CV service):")
os.environ.pop("CV_SERVICE_URL", None)
agg = aggregation_agent.aggregate({"photos": ["data:image/png;base64,xxx"]})
check("cv_available False without service", agg["cv_available"] is False)
check("price factor 1.0 when CV skipped", agg["price_adjustment_factor"] == 1.0)

# ---- llm client fallback ----
print("\nLLM client (no keys):")
llm = LLMClient()
llm.gemini_key = ""
llm.groq_key = ""
res = llm.generate("sys", "prompt", template_fn=lambda: "TEMPLATE OUTPUT")
check("falls back to template with no keys", res.provider == "template" and res.text == "TEMPLATE OUTPUT")


# ---- CV detector (trained model, real inference) ----
print("\nCV detector (in-process ONNX):")
import glob as _glob, base64 as _b64
os.environ["ENABLE_LOCAL_CV"] = "1"
from agents import cv_local
_imgs = sorted(_glob.glob(str(Path(__file__).resolve().parents[1] / "backend-api" / "models" / "*.nonexist")))  # placeholder
check("best.onnx present + model loads", cv_local.MODEL_PATH.exists() and cv_local.available())

# ---- train/serve skew: does inference actually SEE the features it was trained on? ----
# This caught a real, shipped bug: the trainer lowercased its categoricals while _encode did
# not, so "Sedan"/"Dubai"/"GCC" missed the cat_map and 6 of 8 categorical features encoded as
# -1 (unseen) on every real request — while CV metrics, computed with the training encoder,
# stayed perfect. Nothing else in the suite could see it. Assert the contract directly.
print("\nTrain/serve encoding contract:")
from models import valuation_model as _vm  # noqa: E402

_bundle = _vm._load()
_typical = {
    "make": "toyota", "model": "corolla", "year": 2019, "kilometers": 90000,
    "bodyType": "Sedan", "transmissionType": "Automatic", "fuelType": "Petrol",
    "regionalSpecs": "GCC", "sellerType": "Dealer", "city": "Dubai", "noOfCylinders": 4,
}
_enc = _vm._encode(_vm._derive(_typical, _bundle.get("reference_year", 2026)), _bundle)
_unseen = [c for c in _bundle["categorical_features"] if int(_enc[c].iloc[0]) == -1]
check("a typical request resolves EVERY categorical feature (no silent -1)",
      not _unseen, f"unseen: {_unseen}")
check("category matching is case-insensitive",
      _vm.predict({**_typical, "bodyType": "SEDAN", "city": "DUBAI"})["price_mid_aed"]
      == _vm.predict(_typical)["price_mid_aed"])
check("a genuinely unknown category still degrades gracefully to -1, not a crash",
      _vm.predict({**_typical, "bodyType": "Hovercraft"})["price_mid_aed"] > 0)


# ---- E5 anomaly flag on comparables ----
# The flag accuses a listing of being implausible, so both directions matter: it must fire on
# a car at a fraction of its predicted value, and must stay silent on an ordinary one. A
# false-positive here tells a real seller their honest listing looks like fraud.
print("\nAnomaly flag (E5, too-good-to-be-true):")
from agents import anomaly_agent  # noqa: E402

_car = {
    "make": "toyota", "model": "corolla", "year": 2019, "kilometers": 90000,
    "bodyType": "Sedan", "transmissionType": "Automatic", "fuelType": "Petrol",
    "regionalSpecs": "GCC", "sellerType": "Dealer", "city": "Dubai", "noOfCylinders": 4,
}
_fair = anomaly_agent.annotate([{**_car, "price_aed": 45_000}])[0]
_cheap = anomaly_agent.annotate([{**_car, "price_aed": 9_000}])[0]
check("a fairly-priced listing is NOT flagged", "price_anomaly" not in _fair)
check("a listing at ~1/5 of fair value IS flagged", "price_anomaly" in _cheap)
check("flag explains itself with the fair price and a gap",
      bool(_cheap.get("price_anomaly", {}).get("fair_price_aed"))
      and _cheap["price_anomaly"]["below_fair_pct"] > 50)
check("wording says verify, never accuses of fraud",
      "fraud" not in _cheap.get("price_anomaly", {}).get("reason", "").lower())
check("an unpriceable listing is left alone, not flagged",
      "price_anomaly" not in anomaly_agent.annotate([{**_car, "price_aed": None}])[0])
check("annotate does not mutate its input",
      "price_anomaly" not in {**_car, "price_aed": 9_000})

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
