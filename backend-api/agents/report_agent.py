"""
Report agent (Phase 6): write the seller report from computed evidence only.

Assembles an evidence table (valuation numbers, condition findings, comparable listings),
each item tagged with a citation id ([V*]/[D*]/[C*]). The LLM is instructed to ground every
claim with those ids and invent no numbers. A deterministic template writer is the fallback
when no LLM key is set — it is citation-correct by construction, so the pipeline always
produces a Verifier-passing report even before keys exist.
"""
from __future__ import annotations

import re
from typing import Any

from llm_client.client import LLMClient

SYSTEM = (
    "You are a used-car valuation analyst writing a short, honest seller report for the UAE market. "
    "You may ONLY state numbers that appear in the EVIDENCE block. Cite every number with its id in "
    "square brackets, e.g. [V2] or [C1]. Never invent a price, mileage, or damage figure. If the "
    "visual inspection was not available, say so plainly. Keep it to 4 short paragraphs: the headline "
    "value range, what drives it, condition, and comparable listings. Recommend a professional "
    "inspection when confidence is limited."
)


def build_evidence(vehicle: dict, valuation: dict, condition: dict, comparables: list[dict]) -> dict:
    ev: dict[str, Any] = {"valuation": {}, "condition": {}, "comparables": {}, "drivers": {}}
    ev["valuation"] = {
        "V1": {"label": "estimated low", "aed": valuation["price_low_aed"]},
        "V2": {"label": "estimated mid", "aed": valuation["price_mid_aed"]},
        "V3": {"label": "estimated high", "aed": valuation["price_high_aed"]},
        "V4": {"label": "interval coverage", "value": valuation["interval_coverage"]},
        "V5": {"label": "model median error %", "value": valuation["model_meta"]["cv_median_ape_pct"]},
    }
    for i, f in enumerate(valuation["explanation"]["top_factors"][:4], 1):
        ev["drivers"][f"P{i}"] = {
            "feature": f["feature"], "value": f["value"], "aed_impact": f["approx_aed_impact"]}
    if condition.get("cv_available"):
        ev["condition"]["D0"] = {"label": "condition score", "value": condition["condition_score"]}
        for i, f in enumerate(condition["findings"], 1):
            ev["condition"][f"D{i}"] = {
                "damage": f["damage_type"], "instances": f["instances"],
                "confidence": f["max_confidence"], "value_impact_pct": f["value_impact_pct"]}
    else:
        ev["condition"]["D0"] = {"label": "visual inspection", "value": "not available"}
    for i, c in enumerate(comparables, 1):
        ev["comparables"][f"C{i}"] = {
            "listing_id": c["listing_id"], "url": c["url"],
            "desc": f'{c["year"]} {c["make"]} {c["model"]} {c["kilometers"]}km',
            "aed": c["price_aed"]}
    return ev


def _evidence_text(ev: dict) -> str:
    lines = ["EVIDENCE:"]
    for grp, items in ev.items():
        for cid, d in items.items():
            lines.append(f"  [{cid}] {d}")
    return "\n".join(lines)


def _template(vehicle: dict, ev: dict, condition: dict) -> str:
    v = ev["valuation"]
    car = f'{vehicle["year"]} {vehicle["make"].title()} {vehicle["model"].title()}'
    drivers = ev["drivers"]
    drv = ", ".join(
        f'{d["feature"]} ({"+" if d["aed_impact"]>=0 else ""}{int(d["aed_impact"]):,} AED [{cid}])'
        for cid, d in list(drivers.items())[:3])
    comps = ev["comparables"]
    comp_lines = "; ".join(
        f'{d["desc"]} at AED {int(d["aed"]):,} [{cid}]' for cid, d in comps.items())

    if condition.get("cv_available"):
        cond = (f'The photo assessment gave a condition score of {condition["condition_score"]}/100 '
                f'[D0], reflecting detected damage that affects value.')
    else:
        cond = ("A visual damage assessment was not available for this valuation [D0], so the estimate "
                "assumes a market-typical condition — a professional inspection is recommended to confirm.")

    return (
        f'Based on the details provided, {car} has an estimated fair-market value between '
        f'AED {int(v["V1"]["aed"]):,} [V1] and AED {int(v["V3"]["aed"]):,} [V3], with a mid-point of '
        f'AED {int(v["V2"]["aed"]):,} [V2]. This range is a calibrated {round(v["V4"]["value"]*100)}% '
        f'confidence interval [V4].\n\n'
        f'The main factors behind this estimate are {drv}. On held-out testing the pricing model '
        f'carries a median error of about {v["V5"]["value"]}% [V5], so treat the mid-point as a guide, '
        f'not a guarantee.\n\n'
        f'{cond}\n\n'
        f'Comparable live listings support this range: {comp_lines}. If the model\'s confidence is '
        f'limited or the car has damage beyond what the photos show, a professional inspection is the '
        f'safest next step before you set a final asking price.'
    )


_CITE_SPLIT = re.compile(r"(\[[A-Z]\d+\])")
_CITE_ONE = re.compile(r"^\[([A-Z]\d+)\]$")


def _numeric_ids(ev: dict) -> set[str]:
    """Citation ids that must carry an inline number (valuation / drivers / comparable prices)."""
    ids: set[str] = set()
    for grp in ("valuation", "drivers", "comparables"):
        ids.update(ev.get(grp, {}).keys())
    return ids


def _underfilled(text: str, ev: dict) -> bool:
    """
    True when the LLM cited a numeric fact with no number on either side of the
    marker (e.g. 'ranges from [V1] to [V3]'), which renders as blanks once the
    [id] markers are resolved. Such reports are rejected in favour of the template.
    Digits inside neighbouring [id] tokens do not count — we scan plain text only.
    """
    numeric = _numeric_ids(ev)
    parts = _CITE_SPLIT.split(text)  # [text, '[V1]', text, '[V2]', text, ...]
    for i, part in enumerate(parts):
        m = _CITE_ONE.match(part)
        if not m or m.group(1) not in numeric:
            continue  # textual citations (e.g. [D0] 'not available') need no number
        before = parts[i - 1][-8:] if i > 0 else ""
        after = parts[i + 1][:8] if i + 1 < len(parts) else ""
        if not any(c.isdigit() for c in before) and not any(c.isdigit() for c in after):
            return True
    return False


def write_report(vehicle: dict, valuation: dict, condition: dict, comparables: list[dict],
                 llm: LLMClient | None = None) -> dict:
    llm = llm or LLMClient()
    ev = build_evidence(vehicle, valuation, condition, comparables)
    prompt = _evidence_text(ev) + (
        "\n\nWrite the seller report now. Use ONLY the evidence above. ALWAYS write the figure "
        "itself immediately before its [id] — e.g. 'a mid-point of AED 58,269 [V2]', never a bare "
        "'[V2]' with no number in front of it. Do not output any AED figure that is not in the evidence.")
    result = llm.generate(SYSTEM, prompt, temperature=0.3,
                          template_fn=lambda: _template(vehicle, ev, condition))
    text, provider, model = result.text, result.provider, result.model
    # Quality gate: an LLM report that cites numbers without stating them inline
    # would read with blanks — fall back to the citation-correct deterministic writer.
    if provider != "template" and _underfilled(text, ev):
        text = _template(vehicle, ev, condition)
        provider, model = "template", "deterministic-fallback"
    return {"report": text, "provider": provider, "model": model, "evidence": ev}
