"""
D1 — Grounded chat fine-tune dataset generator (master plan workstream D).

Builds the training set for the on-device assistant: for real corpus cars we run the
actual pipeline (valuation model -> comparables retrieval -> evidence pack), ask the
teacher LLM (Groq/Gemini via the existing LLMClient ladder) a spread of realistic
questions, and keep ONLY answers that pass the deterministic Verifier — so 100% of the
training data is grounded by construction. Adversarial "invent a number" questions are
included; for those the correct (kept) behavior is a grounded refusal.

Each JSONL row is a chat sample in the exact shape the runtime task has in the browser:
the evidence block is in the prompt, the cited answer is the target.

  {"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}],
   "meta": {"provider": "groq", "intent": "deal", "verifier_passed": true}}

Without an LLM key this exits cleanly (like scrape_comparables.py) — except with
--include-template, which uses the deterministic fallback writer end-to-end; useful to
smoke-test the plumbing and to seed a handful of style anchors, but a dataset of
templates would only teach the student to parrot templates, so it is off by default.

Usage:
  GROQ_API_KEY=... python scripts/generate_chat_dataset.py --per-car 4 --cars 500
  python scripts/generate_chat_dataset.py --cars 2 --include-template   # keyless smoke test
Writes: data/processed/chat_dataset.jsonl (gitignored — large, regenerable)
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-api"))
sys.path.insert(0, str(ROOT / "backend-api" / "agents"))

from agents import chat_agent  # noqa: E402
from agents.comparables_rag_agent import ComparablesAgent  # noqa: E402
from models import valuation_model  # noqa: E402

CSV = ROOT / "data" / "processed" / "comparables.csv"
OUT = ROOT / "data" / "processed" / "chat_dataset.jsonl"

# Question bank keyed by intent. {mid} etc. are filled per-car so "is X a good deal"
# questions carry a realistic user-quoted figure (admissible per _user_figures).
QUESTIONS = {
    "why": [
        "Why is this car priced at this level?",
        "What are the main factors driving this valuation?",
        "Explain what makes this estimate go up or down.",
    ],
    "deal": [
        "The seller is asking AED {ask:,}. Is that a good deal?",
        "Would AED {ask:,} be overpaying for this car?",
        "What should my opening offer be if the asking price is AED {ask:,}?",
    ],
    "whatif": [
        "How would the price change if the mileage were much higher?",
        "Is this car's mileage high for its age?",
        "Would a one-year-newer model be worth a lot more?",
    ],
    "comparables": [
        "What similar cars are on the market right now?",
        "How does this price compare to actual listings?",
    ],
    "condition": [
        "Does this valuation account for the car's condition?",
        "What would visible damage do to this price?",
    ],
    # Adversarial: the evidence cannot answer these. The kept behavior is a refusal
    # that quotes no invented figure (the Verifier rejects anything else).
    "refusal": [
        "What exactly will this car be worth in three years?",
        "How many previous owners did this car have?",
        "What would this car sell for in Oman?",
        "Give me the exact repair invoice total for the scratches.",
        "What's the dealer's secret minimum price?",
    ],
}


def vehicle_from_row(row: pd.Series) -> dict:
    return {
        "make": str(row["make"]), "model": str(row["model"]),
        "year": int(row["year"]), "kilometers": float(row["kilometers"]),
        "bodyType": str(row.get("bodyType", "")), "fuelType": str(row.get("fuelType", "")),
        "transmissionType": str(row.get("transmissionType", "")),
        "regionalSpecs": str(row.get("regionalSpecs", "")), "city": str(row.get("city", "Dubai")),
        "noOfCylinders": row.get("noOfCylinders"),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cars", type=int, default=500, help="corpus cars to sample")
    ap.add_argument("--per-car", type=int, default=4, help="questions per car")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--sleep", type=float, default=1.0, help="seconds between LLM calls (free-tier RPM)")
    ap.add_argument("--include-template", action="store_true",
                    help="keep deterministic-fallback answers (keyless smoke test / style anchors)")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    has_key = any(os.environ.get(k) for k in ("GROQ_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"))
    if not has_key and not args.include_template:
        print("No GROQ_API_KEY / GEMINI_API_KEY set — nothing to do (teacher LLM required; "
              "use --include-template for a keyless plumbing test).")
        return 0

    rng = random.Random(args.seed)
    df = pd.read_csv(CSV)
    rows = df.sample(n=min(args.cars, len(df)), random_state=args.seed)

    comp_agent = ComparablesAgent()
    kept, rejected = 0, 0
    args.out.parent.mkdir(parents=True, exist_ok=True)

    with args.out.open("w", encoding="utf-8") as f:
        for _, row in rows.iterrows():
            vehicle = vehicle_from_row(row)
            try:
                valuation = valuation_model.predict(vehicle)
                comparables = comp_agent.find(vehicle, k=5)
            except Exception as e:
                print(f"  pipeline failed for {vehicle['make']} {vehicle['model']}: {e} — skipping")
                continue
            ctx = {"vehicle": vehicle, "valuation": valuation,
                   "condition": {"cv_available": False}, "comparables": comparables}
            ask = int(valuation["price_mid_aed"] * rng.uniform(0.85, 1.25))

            intents = rng.sample(list(QUESTIONS), k=min(args.per_car, len(QUESTIONS)))
            for intent in intents:
                question = rng.choice(QUESTIONS[intent]).format(ask=ask)
                res = chat_agent.answer(question, ctx)
                ok = res["verification"]["passed"] and (
                    res["provider"] != "template" or args.include_template
                )
                if not ok:
                    rejected += 1
                    continue
                ev_text = chat_agent._evidence_text(res["evidence"])
                sample = {
                    "messages": [
                        {"role": "system", "content": chat_agent.SYSTEM},
                        {"role": "user", "content": f"{ev_text}\n\nUSER QUESTION: {question}"},
                        {"role": "assistant", "content": res["answer"]},
                    ],
                    "meta": {"provider": res["provider"], "intent": intent,
                             "verifier_passed": True,
                             "car": f'{vehicle["year"]} {vehicle["make"]} {vehicle["model"]}'},
                }
                f.write(json.dumps(sample, ensure_ascii=False) + "\n")
                kept += 1
                if res["provider"] != "template":
                    time.sleep(args.sleep)
            print(f"  {vehicle['year']} {vehicle['make']} {vehicle['model']}: kept so far {kept}")

    print(f"\nkept {kept} samples ({rejected} rejected by the Verifier gate) -> {args.out}")
    print("Every kept answer passed the deterministic Verifier: 100% grounded by construction.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
