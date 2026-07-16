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

from fastapi import FastAPI, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sse_starlette.sse import EventSourceResponse

import api_keys
from agents import chat_agent
from graph import orchestrator

# ---- limits / config ----
MAX_PHOTOS = 8
MAX_PHOTO_CHARS = 8_000_000          # ~6 MB decoded per photo (base64 is ~1.33x)
RATE_LIMIT_MAX = int(os.environ.get("RATE_LIMIT_MAX", "20"))     # requests
RATE_LIMIT_WINDOW = int(os.environ.get("RATE_LIMIT_WINDOW", "60"))  # seconds
# Rate-limited + API-key-metered prefixes (never /health, /ready, or /). The /v1 aliases
# (WS E6) are listed explicitly so versioned paths carry the same limits and metering.
_RATE_PATHS = ("/valuate", "/estimate", "/chat", "/v1/valuate", "/v1/estimate", "/v1/chat")
# CORS: comma-separated origins (never wildcard). Defaults cover local dev + the
# production Vercel app; the regex also allows this project's Vercel preview URLs.
_origins = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,https://auto-valuate-intelligence.vercel.app",
)
ALLOWED_ORIGINS = [o.strip() for o in _origins.split(",") if o.strip()]
ALLOWED_ORIGIN_REGEX = os.environ.get(
    "ALLOWED_ORIGIN_REGEX", r"https://auto-valuate-intelligence[a-z0-9-]*\.vercel\.app"
)

app = FastAPI(
    title="AutoValuate Intelligence API",
    version="1.0.0",
    description=(
        "Explainable, damage-aware used-car valuation for the UAE. Stable versioned "
        "paths live under /v1 (aliases of the root paths); authenticate metered calls "
        "with `Authorization: Bearer <api key>` from the Developers page. "
        "Reference: docs/API.md."
    ),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# ---- simple in-memory per-IP sliding-window rate limiter (fine for one free dyno) ----
_hits: dict[str, deque] = defaultdict(deque)


@app.middleware("http")
async def _rate_limit(request: Request, call_next):
    if request.method == "POST" and request.url.path.startswith(_RATE_PATHS):
        path = request.url.path

        # Programmatic caller with an API key (Phase I): verify + meter against the
        # key's tier quota instead of the anonymous per-IP limit.
        key = api_keys.extract_key(request.headers.get("authorization"))
        if key:
            verdict = await run_in_threadpool(api_keys.consume, key, path)
            if not verdict.allowed:
                status = 429 if "quota" in verdict.reason else 401
                return JSONResponse(
                    status_code=status,
                    content={"ok": False, "error": verdict.reason},
                    headers={"X-RateLimit-Limit": str(verdict.quota),
                             "X-RateLimit-Remaining": str(max(verdict.quota - verdict.used, 0))},
                )
            response = await call_next(request)
            response.headers["X-RateLimit-Limit"] = str(verdict.quota)
            response.headers["X-RateLimit-Remaining"] = str(max(verdict.quota - verdict.used, 0))
            response.headers["X-AutoValuate-Tier"] = verdict.tier or "free"
            return response

        # Anonymous (the web app): unchanged per-IP sliding window.
        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        q = _hits[ip]
        while q and q[0] <= now - RATE_LIMIT_WINDOW:
            q.popleft()
        if len(q) >= RATE_LIMIT_MAX:
            return JSONResponse(status_code=429, content={"ok": False, "error": "rate limit exceeded — please slow down"})
        q.append(now)
    return await call_next(request)


DAMAGE_CLASSES = {
    "dent", "scratch", "crack", "glass_shatter",
    "lamp_broken", "tire_flat", "punctured", "missing_part",
}


class ClientFinding(BaseModel):
    """One per-class finding from an on-device (browser CV) scan."""
    damage_type: str = Field(max_length=40)
    instances: int = Field(ge=0, le=1000)
    max_confidence: float = Field(ge=0.0, le=1.0)
    photos_with_damage: list[int] = Field(default_factory=list, max_length=MAX_PHOTOS)
    value_impact_pct: float = Field(ge=0.0, le=100.0)
    severity: str | None = Field(default=None, max_length=16)  # minor | moderate | severe
    # Guided walk-around capture angles this damage appeared in ("front", "rear-left", …).
    # A camera position, not a panel claim; absent for quick uploads (E2 damage map).
    angles_with_damage: list[str] | None = Field(default=None, max_length=MAX_PHOTOS)

    @field_validator("angles_with_damage")
    @classmethod
    def _cap_angle_len(cls, v: list[str] | None) -> list[str] | None:
        if v and any(len(a) > 16 for a in v):
            raise ValueError("an angle id exceeds the length limit")
        return v


class ClientCondition(BaseModel):
    """
    Condition computed in the browser (Phase A, WASM CV) and sent so the valuation
    is condition-adjusted without any server-side CV RAM. Validated + bounded here;
    the orchestrator trusts these numbers only within safe limits.
    """
    cv_available: bool = True
    condition_score: int = Field(ge=0, le=100)
    # Never boosts price; floored at 0.38 — a photo-only scan can't justify wiping out
    # >62% of value (mirrors aggregation_agent.MAX_TOTAL_DEDUCTION).
    price_adjustment_factor: float = Field(ge=0.38, le=1.0)
    findings: list[ClientFinding] = Field(default_factory=list, max_length=len(DAMAGE_CLASSES))
    photos_assessed: int = Field(ge=0, le=MAX_PHOTOS)
    total_value_impact_pct: float = Field(ge=0.0, le=100.0)
    source: str = Field(default="browser", max_length=20)
    assessment: str | None = Field(default=None, max_length=80)
    needs_inspection: bool = False


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
    client_condition: ClientCondition | None = None

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
        "endpoints": ["/health", "/ready", "/valuate", "/valuate/stream", "/estimate",
                      "/estimate/batch", "/chat", "/market/depreciation",
                      "/v1/*  (stable aliases)"],
    }


@app.get("/health")
def health() -> dict:
    return {"status": "healthy"}


@app.get("/ready")
def ready() -> dict:
    """
    Readiness probe (WS E8): /health says the process is up; this says it can actually
    serve — the valuation model and comparables index are loaded. llm_provider is
    informational only (the template fallback serves valuations without a key).
    """
    checks = {"valuation_model": False, "comparables_index": False,
              "llm_provider": orchestrator._LLM.has_live_provider}
    try:
        from models import valuation_model as _vm
        checks["valuation_model"] = bool(_vm._load())
    except Exception as e:
        print(f"[ready] valuation model: {type(e).__name__}: {e}", file=sys.stderr)
    try:
        checks["comparables_index"] = len(orchestrator._COMPARABLES.store) > 0
    except Exception as e:
        print(f"[ready] comparables index: {type(e).__name__}: {e}", file=sys.stderr)
    ok = checks["valuation_model"] and checks["comparables_index"]
    return {"status": "ready" if ok else "degraded", "checks": checks}


@app.post("/valuate")
async def valuate(req: ValuationRequest) -> dict:
    # run the blocking pipeline off the event loop
    return await run_in_threadpool(orchestrator.run, req.model_dump())


@app.post("/estimate")
async def estimate(req: ValuationRequest) -> dict:
    """
    Fast, model-only re-valuation for the what-if sliders (Phase B): runs ONLY the
    XGBoost quantile + conformal model — no comparables, no RAG, no LLM report — so a
    dragged slider updates the price in well under a second on a warm dyno. Applies the
    same optional client-condition adjustment as the full pipeline so numbers stay
    consistent. Rate-limited + threadpooled like /valuate.
    """
    return await run_in_threadpool(orchestrator.estimate, req.model_dump())


class BatchEstimateRequest(BaseModel):
    """A dealer fleet in one request (WS E2) instead of N sequential /estimate calls."""
    vehicles: list[ValuationRequest] = Field(min_length=1, max_length=100)


@app.post("/estimate/batch")
async def estimate_batch(req: BatchEstimateRequest) -> dict:
    """
    Bulk model-only valuation for the dealer dashboard: one request, one rate-limit
    unit, per-vehicle isolation (a single bad row reports its own error instead of
    sinking the fleet). Same estimator as /estimate, so numbers match exactly.
    """
    def run_all() -> dict:
        results: list[dict] = []
        for v in req.vehicles:
            try:
                results.append({"ok": True, **orchestrator.estimate(v.model_dump())})
            except Exception as e:
                print(f"[estimate/batch] {type(e).__name__}: {e}", file=sys.stderr)
                results.append({"ok": False, "error": "estimate failed for this vehicle"})
        return {"ok": True, "count": len(results), "results": results}
    return await run_in_threadpool(run_all)


# ---- market depreciation curve (WS E3 visual) ----------------------------------------
# The corpus finally has enough rows (1306) to show price-vs-age per model instead of a
# generic rule of thumb. Reads the already-loaded comparables index — no model, no LLM,
# no extra RAM — so this endpoint is cheap enough to leave un-rate-limited like /health.
DEPRECIATION_MIN_POINTS = 8    # below this, model scope is too sparse — widen to the make
DEPRECIATION_MAX_POINTS = 300  # payload cap: evenly thinned for display, median unaffected


@app.get("/market/depreciation")
def market_depreciation(
    make: str = Query(min_length=1, max_length=60),
    model: str = Query(default="", max_length=60),
) -> dict:
    """
    Price-vs-age points from the live corpus for one make/model, plus a median-by-age
    line. Scope degrades honestly: exact model if it has enough listings, else the whole
    make — the response names which, and the UI must say so. Prices are asking prices of
    current listings, never sale prices; that caveat belongs in the UI too.
    """
    from statistics import median as _median

    from models import valuation_model as _vm
    ref_year = _vm._load().get("reference_year", 2026)
    mk, md = make.strip().lower(), model.strip().lower()

    def usable(r: dict) -> bool:
        p, y = r.get("price"), r.get("year")
        # same sanity bounds the training pipeline applies (train_valuation.load)
        return bool(p and 1000 < p < 2_000_000 and y and 1980 <= int(y) <= ref_year)

    rows = orchestrator._COMPARABLES.store.records
    same_make = [r for r in rows if usable(r) and str(r.get("make", "")).lower() == mk]
    same_model = [r for r in same_make if str(r.get("model", "")).lower() == md] if md else []
    scope, pool = (("model", same_model) if len(same_model) >= DEPRECIATION_MIN_POINTS
                   else ("make", same_make))

    pts = sorted(
        ({"age": max(0, ref_year - int(r["year"])), "price": float(r["price"]),
          "km": float(r.get("kilometers") or 0), "year": int(r["year"])} for r in pool),
        key=lambda p: (p["age"], p["price"]),
    )

    # median per age from the FULL pool (display thinning must not move the statistics);
    # single-listing ages are dropped — one asking price is an anecdote, not a median.
    by_age: dict[int, list[float]] = defaultdict(list)
    for p in pts:
        by_age[p["age"]].append(p["price"])
    med = [{"age": a, "price": round(_median(v), 0), "n": len(v)}
           for a, v in sorted(by_age.items()) if len(v) >= 2]

    if len(pts) > DEPRECIATION_MAX_POINTS:
        step = len(pts) / DEPRECIATION_MAX_POINTS
        pts = [pts[int(i * step)] for i in range(DEPRECIATION_MAX_POINTS)]

    return {"ok": True, "scope": scope, "make": mk, "model": md, "n": len(pool),
            "reference_year": ref_year, "points": pts, "median": med}


class ChatMessage(BaseModel):
    role: str = Field(max_length=16)
    content: str = Field(max_length=2000)


class ChatRequest(BaseModel):
    """One question about a finished valuation. `context` is the valuation result."""
    question: str = Field(min_length=1, max_length=500)
    context: dict
    history: list[ChatMessage] = Field(default_factory=list, max_length=10)

    @field_validator("context")
    @classmethod
    def _needs_valuation(cls, v: dict) -> dict:
        if not isinstance(v.get("valuation"), dict):
            raise ValueError("context must include a valuation")
        return v


@app.post("/chat")
async def chat(req: ChatRequest) -> dict:
    """
    Grounded Q&A over a completed valuation (Phase C). The answer is bound to the
    evidence pack and passed through the same deterministic Verifier as the seller
    report — an LLM answer containing an ungrounded number is rejected and replaced
    by the deterministic writer, so the assistant can never quote an invented price.
    """
    return await run_in_threadpool(
        chat_agent.answer, req.question, req.context, [m.model_dump() for m in req.history],
    )


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


# ---- structured access log (WS E4, account-free slice) ------------------------------
# One JSON line per request: method, path, status, duration. Render's log stream then
# gives latency/error visibility with zero new services; a Sentry/PostHog layer can sit
# on top later without touching this.
@app.middleware("http")
async def _access_log(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    print(json.dumps({
        "evt": "request", "method": request.method, "path": request.url.path,
        "status": response.status_code, "ms": round((time.perf_counter() - t0) * 1000, 1),
    }), flush=True)
    return response


# ---- /v1 versioned aliases (WS E6) ---------------------------------------------------
# Stable integration paths for API-key users: same handlers, same schemas, and the same
# rate-limit + metering middleware (see _RATE_PATHS). Root paths stay for the app itself.
for _path, _fn, _methods in (
    ("/health", health, ["GET"]),
    ("/ready", ready, ["GET"]),
    ("/valuate", valuate, ["POST"]),
    ("/valuate/stream", valuate_stream, ["POST"]),
    ("/estimate", estimate, ["POST"]),
    ("/estimate/batch", estimate_batch, ["POST"]),
    ("/chat", chat, ["POST"]),
    ("/market/depreciation", market_depreciation, ["GET"]),
):
    app.add_api_route(f"/v1{_path}", _fn, methods=_methods)
