"""
API-key authentication + usage metering (Phase I).

Programmatic callers authenticate with `Authorization: Bearer av_live_...`. Browser
callers (the web app) send no key and keep the existing per-IP rate limit — so turning
this on does not break the public demo.

The backend deliberately holds only the PUBLIC anon key. Verification and metering go
through the `consume_api_key` SECURITY DEFINER function, which takes a hash (never a key),
returns only a decision plus counters, and records the call itself. A compromised dyno
therefore leaks nothing: no service_role credential, no key material, no user table.

We store and transmit only sha256(key). The plaintext exists once, in the user's browser,
at creation time.
"""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass

import httpx

SUPABASE_URL = os.environ.get(
    "SUPABASE_URL", "https://idshbheawsjsdmvsvvfq.supabase.co",
).rstrip("/")
SUPABASE_ANON = os.environ.get(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2hiaGVhd3Nqc2RtdnN2dmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMjk3MzEsImV4cCI6MjA5OTYwNTczMX0.5Z8kLcH_EroANX5E_5E5X7l8GXez31E4OtVSxkbwFKM",
)

KEY_PREFIX = "av_live_"


@dataclass
class KeyVerdict:
    allowed: bool
    reason: str
    tier: str | None
    used: int
    quota: int


def hash_key(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode()).hexdigest()


def extract_key(auth_header: str | None) -> str | None:
    """Pull a bearer token out of the header, if it looks like one of our keys."""
    if not auth_header:
        return None
    parts = auth_header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token if token.startswith(KEY_PREFIX) else None


def consume(plaintext_key: str, endpoint: str, timeout: float = 8.0) -> KeyVerdict:
    """Verify the key and record one call. Fails CLOSED on any backend error."""
    url = f"{SUPABASE_URL}/rest/v1/rpc/consume_api_key"
    try:
        r = httpx.post(
            url,
            json={"p_hash": hash_key(plaintext_key), "p_endpoint": endpoint},
            headers={
                "apikey": SUPABASE_ANON,
                "Authorization": f"Bearer {SUPABASE_ANON}",
                "Content-Type": "application/json",
            },
            timeout=timeout,
        )
        r.raise_for_status()
        rows = r.json()
        row = rows[0] if isinstance(rows, list) and rows else rows
        return KeyVerdict(
            allowed=bool(row.get("allowed")),
            reason=str(row.get("reason") or "invalid key"),
            tier=row.get("tier"),
            used=int(row.get("used") or 0),
            quota=int(row.get("quota") or 0),
        )
    except Exception:
        # Never fall open: an unreachable auth backend must not silently grant access.
        return KeyVerdict(False, "key verification unavailable", None, 0, 0)
