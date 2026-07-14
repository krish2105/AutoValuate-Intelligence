"""
Phase 8 — HTTP API integration test (the frontend↔backend contract).

Exercises the exact endpoints the Next.js client calls, via FastAPI TestClient:
  GET /            service info
  GET /health      keep-alive
  POST /valuate    full result shape
  POST /valuate/stream  SSE frames parse to 7 trace events + 1 result

Run: USE_TF=0 python eval/api_integration_test.py
"""
from __future__ import annotations
import os
os.environ.setdefault("USE_TF", "0")

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend-api"))

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)
passed = failed = 0


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1; print(f"  [PASS] {name}")
    else:
        failed += 1; print(f"  [FAIL] {name} {detail}")


VEHICLE = {"make": "toyota", "model": "corolla", "year": 2019, "kilometers": 90000,
           "bodyType": "Sedan", "noOfCylinders": 4, "city": "Dubai"}

print("REST endpoints:")
info = client.get("/").json()
check("GET / reports service ok", info.get("status") == "ok")
check("GET / exposes endpoints", "/valuate/stream" in info.get("endpoints", []))
check("GET /health healthy", client.get("/health").json().get("status") == "healthy")

r = client.post("/valuate", json=VEHICLE)
check("POST /valuate 200", r.status_code == 200)
body = r.json()
for key in ("valuation", "condition", "comparables", "report", "verification", "confidence", "trace"):
    check(f"result has '{key}'", key in body)
check("valuation range ordered", body["valuation"]["price_low_aed"] <= body["valuation"]["price_mid_aed"] <= body["valuation"]["price_high_aed"])
check("verifier passed", body["verification"]["passed"])
check("5 comparables", len(body["comparables"]) == 5)

# malformed request -> 422 from pydantic
bad = client.post("/valuate", json={"make": "toyota"})
check("POST /valuate rejects incomplete body (422)", bad.status_code == 422)

print("\nSSE stream:")
with client.stream("POST", "/valuate/stream", json=VEHICLE) as s:
    check("stream 200", s.status_code == 200)
    raw = "".join(s.iter_text())
frames = [f for f in raw.replace("\r\n", "\n").split("\n\n") if f.strip()]
events = []
for fr in frames:
    ev = dat = None
    for line in fr.split("\n"):
        if line.startswith("event:"): ev = line[6:].strip()
        elif line.startswith("data:"): dat = line[5:].strip()
    if ev and dat:
        events.append((ev, json.loads(dat)))
traces = [e for e in events if e[0] == "trace"]
results = [e for e in events if e[0] == "result"]
check("stream emits 7 trace events", len(traces) == 7, f"got {len(traces)}")
check("stream emits 1 result event", len(results) == 1, f"got {len(results)}")
check("final result ok", bool(results) and results[-1][1].get("ok") is True)
check("streamed result verified", bool(results) and results[-1][1]["verification"]["passed"])

print(f"\n{passed} passed, {failed} failed")
Path(__file__).with_name("api_integration_report.json").write_text(
    json.dumps({"passed": passed, "failed": failed, "trace_events": len(traces), "result_events": len(results)}, indent=2))
sys.exit(1 if failed else 0)
