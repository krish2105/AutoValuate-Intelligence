"""
AutoValuate orchestration API (Phase 6) — FastAPI on Render.

Endpoints:
  GET  /                 service info
  GET  /health           keep-alive / cold-start probe
  POST /valuate          run the full graph, return the complete result
  POST /valuate/stream   Server-Sent Events: stream each reasoning-trace step, then the result

The heavy models (XGBoost, comparables index, embedders) load once at import via the
orchestrator's shared singletons. Secrets come only from env vars.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# make agents/models/llm_client/graph importable whether run from repo root or backend-api/
sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("USE_TF", "0")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from graph import orchestrator

app = FastAPI(title="AutoValuate Intelligence API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
    allow_methods=["*"], allow_headers=["*"],
)


class ValuationRequest(BaseModel):
    make: str
    model: str
    year: int
    kilometers: float
    bodyType: str | None = None
    transmissionType: str = "Automatic"
    fuelType: str = "Petrol"
    regionalSpecs: str = "GCC"
    noOfCylinders: int | None = None
    city: str = "Dubai"
    sellerType: str = "Owner"
    photos: list[str] = Field(default_factory=list)


@app.get("/")
def root() -> dict:
    return {
        "service": "AutoValuate Intelligence API",
        "status": "ok",
        "llm_provider_configured": orchestrator._LLM.has_live_provider,
        "cv_service_configured": bool(os.environ.get("CV_SERVICE_URL", "").strip()),
        "endpoints": ["/health", "/valuate", "/valuate/stream"],
    }


@app.get("/health")
def health() -> dict:
    return {"status": "healthy"}


@app.post("/valuate")
def valuate(req: ValuationRequest) -> dict:
    return orchestrator.run(req.model_dump())


@app.post("/valuate/stream")
async def valuate_stream(req: ValuationRequest):
    payload = req.model_dump()

    async def gen():
        for event in orchestrator.stream_steps(payload):
            yield {"event": event["type"], "data": json.dumps(event["data"], default=str)}

    return EventSourceResponse(gen())
