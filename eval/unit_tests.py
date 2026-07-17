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
check("best.onnx present + model loads", cv_local.MODEL_PATH.exists() and cv_local.available())

# The class list is asserted against the MODEL, not against another copy of our own
# constant — the ONNX metadata is the authority on what index means what. A silent
# reordering here would remap every detection (a dent priced as a missing part) while
# every threshold and test still looked fine.
import re as _re, onnxruntime as _ort  # noqa: E402
_meta = _ort.InferenceSession(str(cv_local.MODEL_PATH), providers=["CPUExecutionProvider"]).get_modelmeta()
_names = _re.findall(r"(\d+)\s*:\s*'([^']*)'", _meta.custom_metadata_map.get("names", ""))
_model_classes = [n for _, n in sorted(_names, key=lambda p: int(p[0]))]
check("code class order matches the ONNX metadata's class order",
      _model_classes == list(cv_local.CLASSES), f"model={_model_classes} code={list(cv_local.CLASSES)}")

# ---- repair pricing must not key off detector confidence ----
# Regression for a real defect: _severity returned "severe" at max_confidence >= 0.75, so a
# 1.6x cost multiplier was driven by how SURE the model was rather than how bad the damage
# was — and it overrode the pixel-graded severity the CV pipeline had already computed
# (which deliberately caps scratch/glass_shatter at "moderate"). A crisply-photographed
# trivial scratch was billed 2.7x a faint one.
print("\nRepair pricing severity:")
from agents import repair_cost as _rc  # noqa: E402

check("a high-confidence scratch graded 'minor' by pixels prices as minor",
      _rc._severity({"max_confidence": 0.92, "value_impact_pct": 1.0, "severity": "minor"}) == "minor")
check("a low-confidence finding graded 'severe' by pixels still prices as severe",
      _rc._severity({"max_confidence": 0.31, "value_impact_pct": 1.0, "severity": "severe"}) == "severe")
check("with no pixel grade, the fallback uses extent and ignores confidence",
      _rc._severity({"max_confidence": 0.99, "value_impact_pct": 0.5}) == "minor")
check("an unrecognised severity string falls back rather than being trusted",
      _rc._severity({"max_confidence": 0.1, "value_impact_pct": 4.5, "severity": "catastrophic"}) == "severe")

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

# ---- /valuate and /estimate must price the same car identically (P1) ----
# main.py allowed price_adjustment_factor >= 0.38 while orchestrator.estimate re-clamped to
# 0.5, so a factor of 0.40 gave two different prices from two endpoints documented to agree.
# Both paths now apply the one _clamp_condition_factor. This exercises both factor-application
# sites directly (no LLM/graph needed): estimate() and n_valuation().
print("\nPrice consistency (/valuate vs /estimate):")
from graph import orchestrator  # noqa: E402

_veh_payload = {
    "make": "Toyota", "model": "Corolla", "year": 2019, "kilometers": 90000,
    "bodyType": "Sedan", "transmissionType": "Automatic", "fuelType": "Petrol",
    "regionalSpecs": "GCC", "sellerType": "Owner", "city": "Dubai", "noOfCylinders": 4,
}
# Valid provenance so the condition passes server-side enforcement (tested separately below);
# these tests are about the price *bound*, not the binding.
_PROV = {
    "source": "browser", "photo_set_hash": "cd" * 32,
    "model_version": orchestrator._server_model_version(),
    "preprocessing_version": "1.0.0", "inference_config_version": "1.0.0", "status": "complete",
}
# A factor of 0.40 sits in the 0.38–0.50 gap where the two endpoints used to disagree.
_cond_040 = {
    "cv_available": True, "condition_score": 60, "price_adjustment_factor": 0.40,
    "findings": [], "photos_assessed": 1, "total_value_impact_pct": 60.0, **_PROV,
}
_est = orchestrator.estimate({**_veh_payload, "client_condition": _cond_040})
_veh = intake_agent.validate({**_veh_payload})
_state = {"vehicle": _veh, "condition": orchestrator._condition_from_client(_cond_040)}
_val = orchestrator.n_valuation(_state)["valuation"]
check("the shared floor is the canonical 0.38, derived from MAX_TOTAL_DEDUCTION",
      abs(orchestrator.CONDITION_FACTOR_FLOOR - 0.38) < 1e-9)
check("/estimate applies factor 0.40 (no longer re-clamped up to 0.50)",
      abs(_est["valuation"].get("condition_factor", 1.0) - 0.40) < 1e-9)
check("/estimate and /valuate return the identical mid price for the same car+condition",
      _est["valuation"]["price_mid_aed"] == _val["price_mid_aed"])
# A factor below the floor is clamped identically on both paths (not to two different floors).
_cond_010 = {**_cond_040, "price_adjustment_factor": 0.10}
_est_lo = orchestrator.estimate({**_veh_payload, "client_condition": _cond_010})
_val_lo = orchestrator.n_valuation(
    {"vehicle": _veh, "condition": orchestrator._condition_from_client(_cond_010)})["valuation"]
check("a below-floor factor clamps to 0.38 on both paths, not 0.38 vs 0.50",
      _est_lo["valuation"]["price_mid_aed"] == _val_lo["price_mid_aed"]
      and abs(_est_lo["valuation"]["condition_factor"] - 0.38) < 1e-9)

# ---- client_condition provenance enforcement (P1, forgeable condition) ----
# A browser condition can deflate a price to 0.38, so it must be provably from THIS model +
# config. A hand-written POST with photos:[] and a low factor must be rejected, not priced.
print("\nclient_condition enforcement (forgeable binding):")
_MV = orchestrator._server_model_version()          # the version a genuine scan stamps
_HASH = "ab" * 32                                    # a well-formed 64-hex photo_set_hash


def _cond(**over):
    base = {
        "cv_available": True, "condition_score": 50, "price_adjustment_factor": 0.40,
        "findings": [], "photos_assessed": 1, "total_value_impact_pct": 60.0,
        "source": "browser", "photo_set_hash": _HASH, "model_version": _MV,
        "preprocessing_version": "1.0.0", "inference_config_version": "1.0.0",
        "status": "complete",
    }
    base.update(over)
    return base


_ok = lambda c: orchestrator.accept_client_condition(c)[0]
check("a genuine browser condition (right model + config + hash + complete) is accepted",
      _ok(_cond()))
check("a forged condition with an unknown model_version is REJECTED",
      not _ok(_cond(model_version="deadbeef0000")))
check("a condition with no model_version is REJECTED",
      not _ok(_cond(model_version=None)))
check("a stale preprocessing_version is REJECTED",
      not _ok(_cond(preprocessing_version="0.9.0")))
check("a malformed photo_set_hash is REJECTED",
      not _ok(_cond(photo_set_hash="not-a-hash")))
check("a partial scan WITHOUT consent is REJECTED",
      not _ok(_cond(status="partial")))
check("a partial scan WITH explicit consent is accepted",
      _ok(_cond(status="partial", partial_scan_consent=True)))
check("a synthetic (what-if) condition is accepted even with model_version 'none'",
      _ok(_cond(source="synthetic", model_version="none", photo_set_hash="none")))

# Degraded mode: if the server has no model file to compare (the model lives outside Render's
# rootDir), the model_version check is SKIPPED — not crashed — but the other checks still apply.
orchestrator._server_model_version.cache_clear()
_orig = orchestrator._server_model_version
orchestrator._server_model_version = lambda: ""   # simulate a deployment with no model file
try:
    check("no server model file: enforcement degrades (does not 500), still checks status",
          _ok(_cond(model_version="anything")) and not _ok(_cond(status="partial")))
finally:
    orchestrator._server_model_version = _orig
    orchestrator._server_model_version.cache_clear()

# End-to-end: a forged condition must NOT deflate the /estimate price (falls back to 1.0).
_forged = _cond(model_version="deadbeef0000", price_adjustment_factor=0.40)
_est_forged = orchestrator.estimate({**_veh_payload, "client_condition": _forged})
_est_clean = orchestrator.estimate({**_veh_payload})  # no condition at all
check("a forged condition does NOT deflate the price (server prices it as un-scanned)",
      _est_forged["valuation"]["price_mid_aed"] == _est_clean["valuation"]["price_mid_aed"])
check("a genuine condition DOES still deflate the price",
      orchestrator.estimate({**_veh_payload, "client_condition": _cond()})["valuation"]["price_mid_aed"]
      < _est_clean["valuation"]["price_mid_aed"])

# ---- damage_type validated against the model's class list (P2) ----
print("\ndamage_type validation:")
import main as api_main  # noqa: E402
from agents import cv_local  # noqa: E402


def _finding_ok(dtype) -> bool:
    try:
        api_main.ClientFinding(damage_type=dtype, instances=1, max_confidence=0.5, value_impact_pct=1.0)
        return True
    except Exception:
        return False


check("the API class list is the detector's list, not a second hand-copied constant",
      api_main.DAMAGE_CLASSES == frozenset(cv_local.CLASSES))
check("a valid damage_type ('dent') is accepted", _finding_ok("dent"))
check("an unknown damage_type ('frame_bent') is REJECTED, not silently zero-impacted",
      not _finding_ok("frame_bent"))
check("a garbage damage_type is REJECTED", not _finding_ok("'; DROP TABLE"))

# ---- SSRF guard on server-side image loading (P2) ----
print("\nSSRF guard (cv_local._load_image):")
os.environ.pop("CV_IMAGE_HOST_ALLOWLIST", None)


def _load_raises(spec) -> bool:
    try:
        cv_local._load_image(spec)
        return False
    except Exception:
        return True


check("an http(s) image URL is denied by default (no allowlist)",
      cv_local._url_host_allowed("http://example.com/x.jpg") is False)
check("the cloud-metadata endpoint is denied", _load_raises("http://169.254.169.254/latest/meta-data/"))
check("an arbitrary external URL is denied", _load_raises("https://evil.example/x.jpg"))
check("a localhost URL is denied", _load_raises("http://127.0.0.1:8080/x"))

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
