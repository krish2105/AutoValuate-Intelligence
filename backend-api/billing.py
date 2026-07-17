"""
Billing — the missing half of the paywall (WS-J / commercial readiness).

The pricing page already sends users to Stripe (test-mode payment links). What was missing is
the server side: when a payment completes, nothing upgraded the buyer's tier, so they paid and
stayed on `free`. This module is that webhook.

Design:
  * OPT-IN. Everything is gated on STRIPE_WEBHOOK_SECRET (+ SUPABASE_SERVICE_ROLE_KEY to write the
    tier). With them unset — the current state — /billing/webhook returns 503 "not configured"
    and the rest of the app is completely unaffected. No new Python dependency: Stripe's webhook
    signature is verified with stdlib hmac, so the free-tier image doesn't grow.
  * The webhook is the ONLY thing that grants a paid tier. The client is never trusted to say
    "I paid" — the signed Stripe event is the sole source of truth (mirrors the CV binding).

Flow:
  1. A logged-in user clicks Upgrade → the pricing page opens the Stripe payment link with
     `?client_reference_id=<supabase auth uid>` appended (frontend/app/pricing).
  2. User pays in Stripe test mode.
  3. Stripe POSTs `checkout.session.completed` to /billing/webhook.
  4. We verify the signature, read `client_reference_id` (the uid) and `metadata.tier`
     (set on the payment link), and PATCH public.api_keys.tier for that user via the service role.

Setup is documented in docs/BILLING.md. This never sees a card number; Stripe hosts checkout.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time

import httpx

STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://idshbheawsjsdmvsvvfq.supabase.co").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
VALID_TIERS = {"free", "pro", "dealer"}
_SIG_TOLERANCE_S = 300  # reject events older than 5 min (replay protection), Stripe's default


def configured() -> bool:
    """Billing is live only when both the webhook secret and a role that can write the tier exist."""
    return bool(STRIPE_WEBHOOK_SECRET and SUPABASE_SERVICE_ROLE_KEY)


def _verify_signature(payload: bytes, sig_header: str, now: float) -> bool:
    """
    Verify a Stripe-Signature header (scheme: `t=<ts>,v1=<hex>`) without the stripe SDK.
    Signed payload is `"{t}.{raw_body}"`, HMAC-SHA256 with the webhook secret. Constant-time
    compare, and the timestamp must be within tolerance so a captured event can't be replayed.
    """
    try:
        parts = dict(p.split("=", 1) for p in sig_header.split(","))
        ts = int(parts["t"])
        their_sig = parts["v1"]
    except (ValueError, KeyError):
        return False
    if abs(now - ts) > _SIG_TOLERANCE_S:
        return False
    signed = f"{ts}.".encode() + payload
    ours = hmac.new(STRIPE_WEBHOOK_SECRET.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(ours, their_sig)


def _set_tier(user_id: str, tier: str, timeout: float = 8.0) -> bool:
    """PATCH every api_key row owned by this user to the new tier (service role bypasses RLS)."""
    r = httpx.patch(
        f"{SUPABASE_URL}/rest/v1/api_keys",
        params={"user_id": f"eq.{user_id}"},
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        json={"tier": tier},
        timeout=timeout,
    )
    r.raise_for_status()
    return True


def handle_webhook(payload: bytes, sig_header: str | None) -> tuple[int, dict]:
    """Return (http_status, body). Never raises to the caller — a webhook must answer cleanly."""
    if not configured():
        return 503, {"ok": False, "error": "billing not configured"}
    if not sig_header or not _verify_signature(payload, sig_header, time.time()):
        return 400, {"ok": False, "error": "invalid signature"}

    try:
        event = json.loads(payload)
    except json.JSONDecodeError:
        return 400, {"ok": False, "error": "malformed payload"}

    # Only paid-checkout completions grant a tier. Everything else is acknowledged and ignored.
    if event.get("type") != "checkout.session.completed":
        return 200, {"ok": True, "ignored": event.get("type")}

    session = event.get("data", {}).get("object", {})
    user_id = session.get("client_reference_id")
    tier = (session.get("metadata") or {}).get("tier")
    if not user_id or tier not in VALID_TIERS:
        # Acknowledge (so Stripe doesn't retry forever) but record that we couldn't act.
        return 200, {"ok": False, "error": f"missing client_reference_id or invalid tier {tier!r}"}

    try:
        _set_tier(user_id, tier)
    except Exception as e:  # noqa: BLE001 — a webhook returns 500 so Stripe retries later
        return 500, {"ok": False, "error": f"tier update failed: {type(e).__name__}"}
    return 200, {"ok": True, "upgraded": {"user": user_id, "tier": tier}}
