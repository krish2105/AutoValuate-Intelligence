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

from typing import Any, Iterator, TypedDict

from langgraph.graph import END, StateGraph

from agents import intake_agent, aggregation_agent, comparables_rag_agent, report_agent, verifier_agent
from models import valuation_model
from llm_client.client import LLMClient

# single shared instances (models/index load once)
_COMPARABLES = comparables_rag_agent.ComparablesAgent()
_LLM = LLMClient()


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
        cond = _condition_from_client(client)
        detail = (f'condition {cond["condition_score"]}/100, {len(cond["findings"])} '
                  f'damage type(s) · on-device scan')
        return {"condition": cond, "trace": _trace(state, "aggregation", "ok", detail)}

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
    }


def n_valuation(state: State) -> State:
    val = valuation_model.predict(state["vehicle"])
    # apply the CV condition adjustment to the market-condition price
    factor = state["condition"].get("price_adjustment_factor", 1.0)
    if factor != 1.0:
        for k in ("price_low_aed", "price_mid_aed", "price_high_aed"):
            val[k] = round(val[k] * factor)
        val["condition_adjusted"] = True
        val["condition_factor"] = factor
    detail = (f'AED {int(val["price_low_aed"]):,}–{int(val["price_high_aed"]):,} '
              f'(mid {int(val["price_mid_aed"]):,})')
    return {"valuation": val, "trace": _trace(state, "valuation", "ok", detail)}


def n_comparables(state: State) -> State:
    comps = _COMPARABLES.find(state["vehicle"], k=5)
    detail = f'{len(comps)} comparable(s), top match {comps[0]["similarity"] if comps else 0:.2f}'
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
        score += 1
        weak = [f["damage_type"] for f in cond["findings"] if f["max_confidence"] < 0.5]
        if weak:
            reasons.append(f"low detection confidence for: {', '.join(weak)}")
    else:
        reasons.append("no visual damage assessment was performed")
    if width <= 90:
        score += 1
    else:
        reasons.append(f"wide price interval (±{width/2:.0f}% around mid)")

    level = "high" if score >= 3 else "medium" if score == 2 else "low"
    recommend = level in ("low", "medium")
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
        factor = float(client.get("price_adjustment_factor", 1.0))
    # clamp defensively (mirrors the backend ClientCondition bounds)
    factor = max(0.5, min(1.0, factor))
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
        "comparables": state["comparables"],
        "report": state["report"]["report"],
        "report_provider": state["report"]["provider"],
        "evidence": state["report"]["evidence"],
        "verification": state["verdict"],
        "confidence": state["confidence"],
        "trace": state["trace"],
    }
