"""
AutoValuate orchestration API (Phase 6, hardened) — FastAPI on Render.

Endpoints:
  GET  /                 service info
  GET  /health           keep-alive / cold-start probe
  POST /valuate          run the full graph, return the complete result
  POST /valuate/stream   Server-Sent Events: stream each reasoning-trace step, then the result

Hardening: the blocking model pipeline runs in a worker thread so it never freezes the
event loop (SSE + /health stay responsive under concurrency); per-IP rate limiting protects
the free LLM/CV quota; CORS is locked to configured origins (no wildcard default); payloads
are capped; and errors return a generic message (never a raw traceback) plus, on the stream,
a proper `error` SSE event. Heavy models load once at import via the orchestrator singletons.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import threading
from pathlib import Path

# make agents/models/llm_client/graph importable whether run from repo root or backend-api/
sys.path.insert(0, str(Path(__file__).resolve().parent))

import time
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sse_starlette.sse import EventSourceResponse

from graph import orchestrator

# ---- limits / config ----
MAX_PHOTOS = 8
MAX_PHOTO_CHARS = 8_000_000          # ~6 MB decoded per photo (base64 is ~1.33x)
RATE_LIMIT_MAX = int(os.environ.get("RATE_LIMIT_MAX", "20"))     # requests
RATE_LIMIT_WINDOW = int(os.environ.get("RATE_LIMIT_WINDOW", "60"))  # seconds
_RATE_PATHS = ("/valuate",)          # rate-limited prefixes (never /health or /)
# CORS: comma-separated origins; default to local dev only (never wildcard by default).
_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
ALLOWED_ORIGINS = [o.strip() for o in _origins.split(",") if o.strip()]

app = FastAPI(title="AutoValuate Intelligence API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# ---- simple in-memory per-IP sliding-window rate limiter (fine for one free dyno) ----
_hits: dict[str, deque] = defaultdict(deque)


@app.middleware("http")
async def _rate_limit(request: Request, call_next):
    if request.method == "POST" and request.url.path.startswith(_RATE_PATHS):
        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        q = _hits[ip]
        while q and q[0] <= now - RATE_LIMIT_WINDOW:
            q.popleft()
        if len(q) >= RATE_LIMIT_MAX:
            return JSONResponse(status_code=429, content={"ok": False, "error": "rate limit exceeded — please slow down"})
        q.append(now)
    return await call_next(request)


class ValuationRequest(BaseModel):
    make: str = Field(min_length=1, max_length=60)
    model: str = Field(min_length=1, max_length=60)
    year: int = Field(ge=1980, le=2026)
    kilometers: float = Field(ge=0, le=1_000_000)
    bodyType: str | None = Field(default=None, max_length=40)
    transmissionType: str = Field(default="Automatic", max_length=40)
    fuelType: str = Field(default="Petrol", max_length=40)
    regionalSpecs: str = Field(default="GCC", max_length=40)
    noOfCylinders: int | None = Field(default=None, ge=0, le=16)
    city: str = Field(default="Dubai", max_length=40)
    sellerType: str = Field(default="Owner", max_length=40)
    photos: list[str] = Field(default_factory=list, max_length=MAX_PHOTOS)

    @field_validator("photos")
    @classmethod
    def _cap_photo_size(cls, v: list[str]) -> list[str]:
        for p in v:
            if len(p) > MAX_PHOTO_CHARS:
                raise ValueError("a photo exceeds the size limit")
        return v


# ---- error handling: never leak raw exceptions ----
@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    # log the detail server-side; return a generic message to the client
    print(f"[error] {request.url.path}: {type(exc).__name__}: {exc}", file=sys.stderr)
    return JSONResponse(status_code=500, content={"ok": False, "error": "internal error"})


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
async def valuate(req: ValuationRequest) -> dict:
    # run the blocking pipeline off the event loop
    return await run_in_threadpool(orchestrator.run, req.model_dump())


@app.post("/valuate/stream")
async def valuate_stream(req: ValuationRequest):
    payload = req.model_dump()
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    SENTINEL = object()

    def produce():
        """Run the sync generator in a worker thread; push events to the async queue."""
        try:
            for event in orchestrator.stream_steps(payload):
                loop.call_soon_threadsafe(queue.put_nowait, event)
        except Exception as e:  # surface a real error event, never a raw 500 mid-stream
            print(f"[stream error] {type(e).__name__}: {e}", file=sys.stderr)
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "error", "data": {"ok": False, "error": "valuation failed"}})
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, SENTINEL)

    threading.Thread(target=produce, daemon=True).start()

    async def gen():
        while True:
            event = await queue.get()
            if event is SENTINEL:
                break
            yield {"event": event["type"], "data": json.dumps(event["data"], default=str)}

    return EventSourceResponse(gen())
