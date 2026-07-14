"""
Chat agent (Phase C): a grounded conversational assistant over a finished valuation.

The differentiator is the same one the seller report has: the answer is bound to the
evidence pack (valuation numbers, SHAP drivers, condition findings, comparable listings)
and passed through the deterministic Verifier. An LLM answer that invents a number is
rejected outright and replaced by the deterministic writer, so the assistant can never
quote a price that wasn't computed.

Flow:  evidence pack -> LLM answer (cited) -> Verifier gate -> (fallback if ungrounded)
"""
from __future__ import annotations

import re

from typing import Any

from agents.report_agent import _evidence_text, build_evidence
from agents.verifier_agent import verify
from llm_client.client import LLMClient

SYSTEM = (
    "You are AutoValuate's used-car valuation assistant for the UAE market. Answer the user's "
    "question about THIS car's valuation using ONLY the EVIDENCE block. Cite every number with "
    "its id in square brackets, e.g. [V2] or [C1], and always write the figure itself immediately "
    "before its id — e.g. 'a mid-point of AED 58,269 [V2]'. Never invent a price, mileage, "
    "percentage or damage figure. If the evidence does not contain the answer, say plainly that "
    "you don't have that data rather than guessing. Be concise: 2-4 sentences, plain English, no "
    "bullet lists unless the user asks. You are not a certified appraiser; recommend a "
    "professional inspection when confidence is limited."
)

MAX_HISTORY = 6


def _history_text(history: list[dict]) -> str:
    if not history:
        return ""
    turns = []
    for h in history[-MAX_HISTORY:]:
        role = "User" if h.get("role") == "user" else "Assistant"
        turns.append(f"{role}: {h.get('content', '')[:500]}")
    return "CONVERSATION SO FAR:\n" + "\n".join(turns) + "\n\n"


def _evidence_for(ctx: dict) -> dict:
    """Reuse the evidence the pipeline already computed; rebuild it if the client didn't send it."""
    ev = ctx.get("evidence")
    if isinstance(ev, dict) and ev.get("valuation"):
        return ev
    return build_evidence(
        ctx.get("vehicle", {}), ctx["valuation"], ctx.get("condition", {}), ctx.get("comparables", []),
    )


def _fallback(question: str, ev: dict, ctx: dict) -> str:
    """
    Deterministic, always-grounded answer. Used when no LLM key is set AND as the safety
    net when the LLM's answer fails the Verifier. Routes on intent keywords; every number
    comes straight from the evidence table, so it is citation-correct by construction.
    """
    q = (question or "").lower()
    v = ev["valuation"]
    lo, mid, hi = int(v["V1"]["aed"]), int(v["V2"]["aed"]), int(v["V3"]["aed"])
    cond = ctx.get("condition", {}) or {}

    def drivers_sentence() -> str:
        parts = [
            f'{d["feature"]} ({"+" if d["aed_impact"] >= 0 else ""}{int(d["aed_impact"]):,} AED [{cid}])'
            for cid, d in list(ev.get("drivers", {}).items())[:3]
        ]
        return ", ".join(parts) if parts else "the vehicle's core specifications"

    def comps_sentence() -> str:
        parts = [f'{d["desc"]} at AED {int(d["aed"]):,} [{cid}]'
                 for cid, d in list(ev.get("comparables", {}).items())[:3]]
        return "; ".join(parts) if parts else "no comparable listings were retrieved"

    # deal / negotiation intent
    if any(k in q for k in ("deal", "worth it", "overpriced", "too much", "negotiat", "offer", "fair price")):
        return (
            f"Against this car's computed range, the fair mid-point is AED {mid:,} [V2], with a calibrated "
            f"band from AED {lo:,} [V1] to AED {hi:,} [V3]. Live comparables: {comps_sentence()}. "
            f"Anything meaningfully above AED {hi:,} [V3] is above the model's fair band — use the "
            f"mid-point as your anchor and the upper bound as your walk-away."
        )
    # why this price / drivers
    if any(k in q for k in ("why", "driver", "factor", "shap", "explain", "affect", "impact")):
        return (
            f"The mid-point of AED {mid:,} [V2] is driven mainly by {drivers_sentence()}. "
            f"On held-out testing the pricing model carries a median error of about "
            f'{v["V5"]["value"]}% [V5], so treat the mid-point as a guide rather than a guarantee.'
        )
    # condition / damage  (checked BEFORE mileage/age: "damage" contains the substring "age")
    if any(k in q for k in ("damage", "condition", "dent", "scratch", "repair", "photo", "inspect")):
        if cond.get("cv_available"):
            return (
                f'The on-device scan gave a condition score of {cond.get("condition_score")}/100 [D0] from '
                f'{cond.get("photos_assessed", 0)} photo(s), and that is already reflected in the mid-point of '
                f"AED {mid:,} [V2]. A professional inspection is still the safest confirmation before you transact."
            )
        return (
            "No photo-based damage assessment was run for this valuation [D0], so the estimate assumes "
            f"market-typical condition. The mid-point of AED {mid:,} [V2] could move once real damage is "
            "assessed — upload photos to run the on-device scan, or get a professional inspection."
        )
    # mileage / age / what-if  (word-boundary match so "damage" never counts as "age")
    if re.search(r"\b(mileage|kilometres?|kilometers?|km|what[- ]?if|older|newer|age|year)\b", q):
        return (
            f"Mileage and age are priced in already: the drivers behind this estimate are {drivers_sentence()}. "
            f"To see the effect of a different mileage or year, drag the what-if sliders — they re-run the "
            f"pricing model directly. The current mid-point is AED {mid:,} [V2]."
        )
    # comparables
    if any(k in q for k in ("comparable", "similar", "listing", "market", "others")):
        return (
            f"The closest live listings retrieved for this car are: {comps_sentence()}. "
            f"Against those, this car's computed mid-point is AED {mid:,} [V2] within a band of "
            f"AED {lo:,} [V1] to AED {hi:,} [V3]."
        )
    # default: headline summary
    return (
        f"This car's fair-market estimate is AED {mid:,} [V2], within a calibrated band of AED {lo:,} [V1] "
        f"to AED {hi:,} [V3]. The main drivers are {drivers_sentence()}. Ask me about the price drivers, "
        f"the comparable listings, the condition, or whether a given asking price is fair."
    )


def answer(question: str, ctx: dict, history: list[dict] | None = None,
           llm: LLMClient | None = None) -> dict[str, Any]:
    """Answer one question about a completed valuation, grounded + Verifier-gated."""
    llm = llm or LLMClient()
    history = history or []
    ev = _evidence_for(ctx)

    prompt = (
        _evidence_text(ev)
        + "\n\n"
        + _history_text(history)
        + f"USER QUESTION: {question}\n\n"
        + "Answer now using ONLY the evidence above, citing every number with its [id]."
    )
    res = llm.generate(SYSTEM, prompt, temperature=0.2,
                       template_fn=lambda: _fallback(question, ev, ctx))
    text, provider = res.text, res.provider

    # Verifier gate: an ungrounded number is never served — fall back to the deterministic writer.
    ver = verify(text, ev)
    if not ver["passed"] and provider != "template":
        text = _fallback(question, ev, ctx)
        provider = "template"
        ver = verify(text, ev)

    return {
        "answer": text,
        "provider": provider,
        "verification": ver,
        "evidence": ev,
    }
