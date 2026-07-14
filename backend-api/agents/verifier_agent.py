"""
Verifier agent (Phase 6): hard gate on the generated report.

Rule: every AED figure and every [citation] in the report must trace to a real
computed value in the evidence. Any ungrounded number is a violation. This is what
stops the LLM inventing prices — a suggestion in the spec, enforced here as a gate.

Returns a verdict; the API refuses to serve a report that fails (or serves it flagged,
per policy). No LLM call — pure, deterministic, auditable.
"""
from __future__ import annotations

import re
from typing import Any

# "AED 45,000" / "45,000 AED" / "AED 45000"
_AED = re.compile(r"(?:AED|aed)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(?:AED|aed)")
_CITE = re.compile(r"\[([A-Z]\d+)\]")
# percentages the report may legitimately state (from evidence values)
_PCT = re.compile(r"([\d]+(?:\.\d+)?)\s*%")


def _all_aed_values(evidence: dict) -> list[float]:
    vals: list[float] = []
    for grp in evidence.values():
        for item in grp.values():
            if isinstance(item.get("aed"), (int, float)):
                vals.append(float(item["aed"]))
            # SHAP driver contributions are shown as AED impacts (may be negative)
            if isinstance(item.get("aed_impact"), (int, float)):
                vals.append(abs(float(item["aed_impact"])))
    return vals


def _all_pct_values(evidence: dict) -> list[float]:
    vals: list[float] = []
    for grp in evidence.values():
        for item in grp.values():
            v = item.get("value")
            if isinstance(v, (int, float)):
                vals.append(float(v))            # e.g. 19.57 (median err %)
                if 0 < v <= 1:                   # coverage stored as 0.799, shown as 79 / 79.9 / 80
                    vals.extend([v * 100, round(v * 100), float(int(v * 100))])
            imp = item.get("value_impact_pct")
            if isinstance(imp, (int, float)):
                vals.append(float(imp))
    return vals


def verify(report: str, evidence: dict, aed_tol: float = 0.02, pct_tol: float = 0.6) -> dict[str, Any]:
    violations: list[str] = []

    valid_ids = {cid for grp in evidence.values() for cid in grp}
    aed_ok = _all_aed_values(evidence)
    # the valuation range endpoints define an allowed continuous band too
    band_lo = min([evidence["valuation"][k]["aed"] for k in ("V1", "V2", "V3")], default=0)
    band_hi = max([evidence["valuation"][k]["aed"] for k in ("V1", "V2", "V3")], default=0)
    pct_ok = _all_pct_values(evidence)

    # 1) every citation must reference a real evidence id
    for cid in _CITE.findall(report):
        if cid not in valid_ids:
            violations.append(f"citation [{cid}] does not exist in evidence")

    # 2) every AED figure must match a known value (tolerance) or fall inside the range band
    for m in _AED.finditer(report):
        raw = m.group(1) or m.group(2)
        try:
            amt = float(raw.replace(",", ""))
        except ValueError:
            continue
        matched = any(abs(amt - k) <= max(1.0, aed_tol * max(k, 1)) for k in aed_ok)
        in_band = band_lo * (1 - aed_tol) <= amt <= band_hi * (1 + aed_tol)
        if not (matched or in_band):
            violations.append(f"AED {amt:,.0f} is not grounded in any evidence value")

    # 3) percentages must match a known evidence value (looser tolerance)
    for m in _PCT.finditer(report):
        try:
            p = float(m.group(1))
        except ValueError:
            continue
        if not any(abs(p - k) <= pct_tol for k in pct_ok):
            violations.append(f"{p}% is not grounded in any evidence value")

    n_numbers = len(_AED.findall(report)) + len(_PCT.findall(report))
    return {
        "passed": len(violations) == 0,
        "violations": violations,
        "numbers_checked": n_numbers,
        "citations_checked": len(_CITE.findall(report)),
    }
