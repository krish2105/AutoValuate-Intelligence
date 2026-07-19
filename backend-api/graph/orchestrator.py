"""
LangGraph orchestrator (Phase 6): the valuation state machine.

Intake → Aggregation (CV) → Valuation → Comparables → Report → Verifier,
then a confidence-disclosure step that implements Section 15's contract exactly:
states the valuation interval width, the per-damage CV confidence, and recommends
a professional inspection whenever confidence is limited.

Each node appends a trace entry so the frontend can stream the reasoning live.
Exposes both `run()` (batch) and `stream_steps()` (generator for SSE).
"""
from __future__ import annotations

import logging
from typing import Any, Iterator, TypedDict

log = logging.getLogger(__name__)

from langgraph.graph import END, StateGraph

from agents import (
    intake_agent, aggregation_agent, anomaly_agent, comparables_rag_agent, report_agent,
    repair_cost, verifier_agent,
)
from models import valuation_model
from llm_client.client import LLMClient

# single shared instances (models/index load once)
_COMPARABLES = comparables_rag_agent.ComparablesAgent()
_LLM = LLMClient()

# The ONE bound on how far a CV condition may deflate a price, derived from the single
# source of truth (aggregation_agent.MAX_TOTAL_DEDUCTION) so it can never drift. Both the
# full graph (n_valuation) and the fast path (estimate) apply this same clamp, so /valuate
# and /estimate return the same price for the same car. Previously estimate re-clamped to
# 0.5 while /valuate honoured the 0.38 Pydantic bound, so a factor of 0.40 gave two prices.
CONDITION_FACTOR_FLOOR = round(1.0 - aggregation_agent.MAX_TOTAL_DEDUCTION, 4)  # 0.38


def _clamp_condition_factor(factor: float) -> float:
    """A CV condition may only deflate a price, and never below the canonical floor."""
    return max(CONDITION_FACTOR_FLOOR, min(1.0, factor))


# --- client_condition provenance enforcement (docs/CV_INFERENCE_SPEC.md §4) ---------------
# A browser-produced condition can move the price, so it must be provably from THIS model and
# config — otherwise a POST with photos:[] and a hand-written condition could deflate a price
# to the 0.38 floor with no scan behind it. We reject a browser condition whose model_version
# is not the one we ship, whose pre/post-processing version is stale, whose photo_set_hash is
# malformed, or whose scan is partial without explicit consent. On rejection the condition is
# dropped (treated as no-CV, factor 1.0) — fail-safe: the only thing a forger loses is the
# ability to *lower* a price they never scanned. `source:"synthetic"` (what-if sliders, demo
# fixtures) is a user-chosen hypothetical, not a claimed scan, so it is exempt from the model
# checks but is never reported as a real CV assessment (see _condition_from_client).
import hashlib
from functools import lru_cache

# 1.1.0 = deterministic pure-JS area-average preprocessing (frontend cv-browser.ts). Both are
# accepted so a browser still serving the older bundle during a rolling deploy is not rejected —
# its scan is valid for the code that produced it. Neither ever bit-matched the server resampler
# (spec §6 #4 is environmental), so this gate is about identity, not pixel parity.
ACCEPTED_PREPROCESSING_VERSIONS = frozenset({"1.0.0", "1.1.0"})
# 1.1.0 = adds damage-extent escalation to the scoring (aggregation_agent). Both accepted so a
# browser on the older bundle isn't rejected during a rolling deploy.
ACCEPTED_INFERENCE_CONFIG_VERSIONS = frozenset({"1.0.0", "1.1.0", "1.2.0", "1.3.0"})


@lru_cache(maxsize=1)
def _server_model_version() -> str:
    """
    SHA-256[:12] of the shipped ONNX — the model_version a genuine browser scan stamps.
    Computed from the backend's own copy so it cannot drift from a hardcoded constant.

    Returns "" if that copy is not present in the deployment (the model lives outside the
    Render `rootDir` and server-side CV is off there, so it may legitimately be absent). In
    that case the model_version check is skipped — never crashed — and the other provenance
    checks (config versions, photo_set_hash, status/consent) still apply. A missing model file
    must degrade enforcement, not 500 every valuation.
    """
    from agents import cv_local
    try:
        return hashlib.sha256(cv_local.MODEL_PATH.read_bytes()).hexdigest()[:12]
    except OSError:
        log.warning("server ONNX unavailable (%s); model_version enforcement degraded", cv_local.MODEL_PATH)
        return ""


def _is_hex_hash(v, length: int = 64) -> bool:
    if not isinstance(v, str) or len(v) != length:
        return False
    try:
        int(v, 16)
        return True
    except ValueError:
        return False


def accept_client_condition(client: dict) -> tuple[bool, str]:
    """Return (accepted, reason). A rejected condition is dropped, not trusted."""
    if not client or not client.get("cv_available"):
        return False, "no condition"
    if client.get("source") == "synthetic":
        # A what-if hypothesis, not a claimed scan. Allowed to move the price (bounded by the
        # Pydantic 0.38 floor); flagged non-real downstream so it is never called an assessment.
        return True, "synthetic (what-if)"
    mv = client.get("model_version")
    server_mv = _server_model_version()
    if server_mv and mv != server_mv:  # skip only when the server has no model file to compare
        return False, f"unrecognised model_version {mv!r}"
    if client.get("preprocessing_version") not in ACCEPTED_PREPROCESSING_VERSIONS:
        return False, f"stale preprocessing_version {client.get('preprocessing_version')!r}"
    if client.get("inference_config_version") not in ACCEPTED_INFERENCE_CONFIG_VERSIONS:
        return False, f"stale inference_config_version {client.get('inference_config_version')!r}"
    # The photos never reach the server (privacy), so the hash cannot be RE-computed here — we
    # verify it is present and well-formed. A full match is only possible on the server-CV path
    # (photos posted), where the server computes its own condition and ignores the client's.
    if not _is_hex_hash(client.get("photo_set_hash")):
        return False, "missing or malformed photo_set_hash"
    status = client.get("status")
    if status == "partial" and not client.get("partial_scan_consent"):
        return False, "partial scan without explicit consent"
    if status not in ("complete", "partial"):
        return False, f"unknown scan status {status!r}"
    return True, "verified browser scan"


class State(TypedDict, total=False):
    payload: dict
    vehicle: dict
    condition: dict
    valuation: dict
    comparables: list
    report: dict
    verdict: dict
    confidence: dict
    trace: list
    error: str


def _trace(state: State, step: str, status: str, detail: Any) -> list:
    return state.get("trace", []) + [{"step": step, "status": status, "detail": detail}]


# ---- nodes ---------------------------------------------------------------
def n_intake(state: State) -> State:
    try:
        vehicle = intake_agent.validate(state["payload"])
    except intake_agent.IntakeError as e:
        return {"error": str(e), "trace": _trace(state, "intake", "error", str(e))}
    return {"vehicle": vehicle,
            "trace": _trace(state, "intake", "ok",
                            f'{vehicle["year"]} {vehicle["make"]} {vehicle["model"]}, '
                            f'{int(vehicle["kilometers"]):,} km, {len(vehicle["photos"])} photo(s)')}


def n_aggregate(state: State) -> State:
    # Prefer an on-device (browser CV) condition when the client sent one — it's the
    # free production path (no server CV RAM). Same condition shape as the server
    # aggregator, so downstream valuation/report/confidence are unchanged.
    client = (state.get("payload") or {}).get("client_condition")
    if client and client.get("cv_available"):
        accepted, reason = accept_client_condition(client)
        if accepted:
            cond = _condition_from_client(client)
            src = "what-if" if client.get("source") == "synthetic" else "on-device scan"
            detail = (f'condition {cond["condition_score"]}/100, {len(cond["findings"])} '
                      f'damage type(s) · {src}')
            return {"condition": cond, "trace": _trace(state, "aggregation", "ok", detail)}
        # Unverifiable client condition: do not price on it. Fall through to server CV (if a
        # detector + photos are available) or an honest no-CV condition (factor 1.0).
        log.warning("rejected client_condition: %s", reason)

    cond = aggregation_agent.aggregate(state["vehicle"])
    if cond["cv_available"]:
        detail = f'condition {cond["condition_score"]}/100, {len(cond["findings"])} damage type(s)'
    else:
        detail = f'CV skipped ({cond["reason"]})'
    return {"condition": cond, "trace": _trace(state, "aggregation", "ok", detail)}


def _condition_from_client(client: dict) -> dict:
    """Normalize a validated browser-CV condition to the server condition shape."""
    findings = [
        {
            "damage_type": f.get("damage_type"),
            "instances": int(f.get("instances", 0)),
            "max_confidence": round(float(f.get("max_confidence", 0.0)), 3),
            "photos_with_damage": list(f.get("photos_with_damage", [])),
            "value_impact_pct": round(float(f.get("value_impact_pct", 0.0)), 1),
            # Carried through, not dropped. The browser graded this from the crop's actual
            # pixels (gradient energy, dark fraction, extent). Dropping it here left
            # repair_cost with nothing to price on but detector confidence — so a scratch
            # the model was merely *sure* about got billed as severe. See repair_cost._severity.
            "severity": f.get("severity"),
        }
        for f in client.get("findings", [])
    ]
    return {
        "cv_available": True,
        "condition_score": int(client.get("condition_score", 100)),
        "price_adjustment_factor": round(float(client.get("price_adjustment_factor", 1.0)), 4),
        "findings": findings,
        "photos_assessed": int(client.get("photos_assessed", 0)),
        "total_value_impact_pct": round(float(client.get("total_value_impact_pct", 0.0)), 1),
        "source": "browser",
        # Provenance: which photos, which weights, which config produced this. Lets a
        # damage finding (and the price it moved) be traced back to a specific image +
        # model + detection output instead of being an anonymous multiplier.
        "photo_set_hash": client.get("photo_set_hash"),
        "model_version": client.get("model_version"),
        "preprocessing_version": client.get("preprocessing_version"),
        "inference_config_version": client.get("inference_config_version"),
        "scan_status": client.get("status"),
        # The browser already decided whether this car warrants a physical look (structural
        # finding, moderate+ severity, low score, or — crucially — a scan that found NOTHING,
        # which is unconfirmed rather than clean). Both fields were declared on the wire and
        # validated, then dropped here, so that judgement never reached any consumer and the
        # confidence agent was free to conclude the opposite. Carry them through.
        "needs_inspection": bool(client.get("needs_inspection", False)),
        "assessment": client.get("assessment"),
    }


def n_valuation(state: State) -> State:
    val = valuation_model.predict(state["vehicle"])
    # apply the CV condition adjustment to the market-condition price
    factor = _clamp_condition_factor(state["condition"].get("price_adjustment_factor", 1.0))
    if factor != 1.0:
        for k in ("price_low_aed", "price_mid_aed", "price_high_aed"):
            val[k] = round(val[k] * factor)
        val["condition_adjusted"] = True
        val["condition_factor"] = factor
    detail = (f'AED {int(val["price_low_aed"]):,}–{int(val["price_high_aed"]):,} '
              f'(mid {int(val["price_mid_aed"]):,})')
    return {"valuation": val, "trace": _trace(state, "valuation", "ok", detail)}


def n_comparables(state: State) -> State:
    comps = anomaly_agent.annotate(_COMPARABLES.find(state["vehicle"], k=5))
    flagged = sum(1 for c in comps if c.get("price_anomaly"))
    detail = f'{len(comps)} comparable(s), top match {comps[0]["similarity"] if comps else 0:.2f}'
    if flagged:
        detail += f' · {flagged} priced implausibly low'
    return {"comparables": comps, "trace": _trace(state, "comparables", "ok", detail)}


def n_report(state: State) -> State:
    rep = report_agent.write_report(
        state["vehicle"], state["valuation"], state["condition"], state["comparables"], llm=_LLM)
    return {"report": rep,
            "trace": _trace(state, "report", "ok", f'written via {rep["provider"]}')}


def n_verify(state: State) -> State:
    verdict = verifier_agent.verify(state["report"]["report"], state["report"]["evidence"])
    status = "ok" if verdict["passed"] else "flagged"
    detail = (f'{verdict["numbers_checked"]} numbers, {verdict["citations_checked"]} citations checked; '
              + ("all grounded" if verdict["passed"] else f'{len(verdict["violations"])} violation(s)'))
    return {"verdict": verdict, "trace": _trace(state, "verifier", status, detail)}


def n_confidence(state: State) -> State:
    val, cond = state["valuation"], state["condition"]
    comps, vehicle = state["comparables"], state["vehicle"]
    width = val.get("interval_pct_width", 0)
    reasons: list[str] = []

    # Data-support signal: how well the market actually covers this vehicle.
    top_sim = comps[0]["similarity"] if comps else 0.0
    same_make = sum(1 for c in comps if str(c["make"]).lower() == str(vehicle["make"]).lower())
    strong_support = top_sim >= 0.80 and same_make >= 3

    # Score 0–3: good comparables + visual assessment + a not-too-wide interval.
    score = 0
    if strong_support:
        score += 1
    else:
        reasons.append("few closely-comparable listings for this make/model")
    if cond.get("cv_available"):
        # A scan that found NOTHING must not score as positive evidence. It previously did:
        # cv_available alone earned +1, and the only counterweight (weak findings) is empty when
        # there are no findings at all — so a wrecked car the detector failed to read came out
        # MORE confident than one where it found damage, and could reach "high", which switches
        # the inspection recommendation OFF. That is the Civic failure propagating downstream.
        # Detector recall is 0.690, so "found nothing" is unconfirmed, not clean.
        if cond["findings"]:
            score += 1
            weak = [f["damage_type"] for f in cond["findings"] if f["max_confidence"] < 0.5]
            if weak:
                reasons.append(f"low detection confidence for: {', '.join(weak)}")
        else:
            reasons.append("the photo scan detected no damage, which is unconfirmed rather than "
                           "clean — this detector finds roughly two-thirds of real damage")
    else:
        reasons.append("no visual damage assessment was performed")
    if width <= 90:
        score += 1
    else:
        reasons.append(f"wide price interval (±{width/2:.0f}% around mid)")

    level = "high" if score >= 3 else "medium" if score == 2 else "low"
    # The scanner's own judgement is authoritative and can only ADD caution: a structural
    # finding at a high numeric score, or a zero-detection scan, still warrants a physical
    # inspection no matter how confident the pricing side is.
    recommend = level in ("low", "medium") or bool(cond.get("needs_inspection"))
    disclosure = {
        "level": level,
        "valuation_interval_pct": width,
        "cv_assessed": cond.get("cv_available", False),
        "reasons": reasons,
        "recommend_professional_inspection": recommend,
        "statement": _disclosure_text(level, recommend, cond.get("cv_available", False)),
    }
    return {"confidence": disclosure,
            "trace": _trace(state, "confidence", "ok", f'confidence: {level}')}


def _disclosure_text(level: str, recommend: bool, cv: bool) -> str:
    base = {
        "high": "Confidence in this estimate is high given the available data.",
        "medium": "Confidence in this estimate is moderate.",
        "low": "Confidence in this estimate is limited.",
    }[level]
    cv_note = ("" if cv else " No photo-based damage assessment was performed, so the figure assumes "
               "market-typical condition.")
    rec = (" We recommend a professional inspection before relying on this number for a transaction."
           if recommend else "")
    disclaimer = (" This is an automated estimate, not a certified appraisal.")
    return base + cv_note + rec + disclaimer


# ---- graph ---------------------------------------------------------------
def _build():
    g = StateGraph(State)
    g.add_node("intake_step", n_intake)
    g.add_node("aggregation_step", n_aggregate)
    g.add_node("valuation_step", n_valuation)
    g.add_node("comparables_step", n_comparables)
    g.add_node("report_step", n_report)
    g.add_node("verifier_step", n_verify)
    g.add_node("confidence_step", n_confidence)

    g.set_entry_point("intake_step")

    def after_intake(s: State) -> str:
        return "aggregation_step" if not s.get("error") else END
    g.add_conditional_edges("intake_step", after_intake,
                            {"aggregation_step": "aggregation_step", END: END})
    g.add_edge("aggregation_step", "valuation_step")
    g.add_edge("valuation_step", "comparables_step")
    g.add_edge("comparables_step", "report_step")
    g.add_edge("report_step", "verifier_step")
    g.add_edge("verifier_step", "confidence_step")
    g.add_edge("confidence_step", END)
    return g.compile()


_GRAPH = _build()


def run(payload: dict) -> dict:
    final = _GRAPH.invoke({"payload": payload, "trace": []})
    return _shape(final)


def estimate(payload: dict) -> dict:
    """
    Fast, model-only valuation for the what-if sliders (Phase B): intake + the
    XGBoost quantile/conformal model only — no comparables, RAG, LLM, or verifier.
    Applies the same optional client-condition price adjustment as the full graph so
    a slider drag and a full run agree on the number. Returns just {ok, valuation}.
    """
    try:
        vehicle = intake_agent.validate(payload)
    except intake_agent.IntakeError as e:
        return {"ok": False, "error": str(e)}

    val = valuation_model.predict(vehicle)
    client = payload.get("client_condition")
    factor = 1.0
    if client and client.get("cv_available"):
        accepted, reason = accept_client_condition(client)
        if accepted:
            factor = float(client.get("price_adjustment_factor", 1.0))
        else:
            log.warning("estimate: rejected client_condition: %s", reason)
    # Same clamp as the full graph (n_valuation) so /estimate and /valuate agree exactly.
    factor = _clamp_condition_factor(factor)
    if factor != 1.0:
        for k in ("price_low_aed", "price_mid_aed", "price_high_aed"):
            val[k] = round(val[k] * factor)
        val["condition_adjusted"] = True
        val["condition_factor"] = round(factor, 4)
    return {"ok": True, "valuation": val}


def stream_steps(payload: dict) -> Iterator[dict]:
    """Yield each node's trace entry as it completes (for SSE)."""
    seen = 0
    last: State = {}
    for chunk in _GRAPH.stream({"payload": payload, "trace": []}, stream_mode="values"):
        last = chunk
        tr = chunk.get("trace", [])
        while seen < len(tr):
            yield {"type": "trace", "data": tr[seen]}
            seen += 1
    yield {"type": "result", "data": _shape(last)}


def _shape(state: State) -> dict:
    if state.get("error"):
        return {"ok": False, "error": state["error"], "trace": state.get("trace", [])}
    return {
        "ok": True,
        "vehicle": state["vehicle"],
        "valuation": state["valuation"],
        "condition": state["condition"],
        # Phase F: itemised repair estimate derived from the same detections that
        # adjusted the price — makes the detection -> cost -> value chain explicit.
        "repair": repair_cost.estimate(state["condition"]),
        "comparables": state["comparables"],
        "report": state["report"]["report"],
        "report_provider": state["report"]["provider"],
        "evidence": state["report"]["evidence"],
        "verification": state["verdict"],
        "confidence": state["confidence"],
        "trace": state["trace"],
    }
