"""
Unified LLM client (Phase 6): Gemini Flash primary → Groq Llama 3.3 70B fallback.

One `generate()` behind a stable interface so swapping providers is a config change.
When neither key is set (local dev / demo before keys exist), a deterministic
template writer is used so the whole agent graph still runs end-to-end. The provider
actually used is always returned, never hidden.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass


@dataclass
class LLMResult:
    text: str
    provider: str          # "gemini" | "groq" | "template"
    model: str


class _Breaker:
    """
    Per-provider circuit breaker (WS E8). A provider that keeps failing — rate-limited,
    quota-exhausted, outage — is skipped for a cooldown instead of adding its timeout to
    every request, so the ladder degrades to the next provider (or template) instantly.
    """
    THRESHOLD = 3          # consecutive failures that trip the breaker
    COOLDOWN = 120.0       # seconds a tripped provider sits out

    def __init__(self) -> None:
        self.fails = 0
        self.open_until = 0.0

    @property
    def open(self) -> bool:
        return time.monotonic() < self.open_until

    def record(self, ok: bool) -> None:
        if ok:
            self.fails = 0
            return
        self.fails += 1
        if self.fails >= self.THRESHOLD:
            self.open_until = time.monotonic() + self.COOLDOWN
            self.fails = 0


# Shared across LLMClient instances — a breaker per process, not per request.
_BREAKERS = {"gemini": _Breaker(), "groq": _Breaker()}


class LLMClient:
    def __init__(self,
                 gemini_model: str = "gemini-2.0-flash",
                 groq_model: str = "llama-3.3-70b-versatile"):
        self.gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
        self.groq_key = os.environ.get("GROQ_API_KEY", "").strip()
        self.gemini_model = gemini_model
        self.groq_model = groq_model

    # ---- providers -------------------------------------------------------
    def _gemini(self, system: str, prompt: str, temperature: float) -> str:
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=self.gemini_key)
        resp = client.models.generate_content(
            model=self.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system, temperature=temperature),
        )
        return (resp.text or "").strip()

    def _groq(self, system: str, prompt: str, temperature: float) -> str:
        from groq import Groq
        client = Groq(api_key=self.groq_key)
        resp = client.chat.completions.create(
            model=self.groq_model,
            messages=[{"role": "system", "content": system},
                      {"role": "user", "content": prompt}],
            temperature=temperature,
        )
        return (resp.choices[0].message.content or "").strip()

    # ---- public ----------------------------------------------------------
    def generate(self, system: str, prompt: str, temperature: float = 0.3,
                 template_fn=None) -> LLMResult:
        """Try Gemini, then Groq, then the deterministic template (if provided)."""
        errors = []
        ladder = (("gemini", self.gemini_key, self._gemini, self.gemini_model),
                  ("groq", self.groq_key, self._groq, self.groq_model))
        for name, key, fn, model in ladder:
            if not key:
                continue
            breaker = _BREAKERS[name]
            if breaker.open:
                errors.append(f"{name}: circuit open (cooling down)")
                continue
            try:
                text = fn(system, prompt, temperature)
                breaker.record(True)
                return LLMResult(text, name, model)
            except Exception as e:  # rate limit / transient -> fall through
                breaker.record(False)
                errors.append(f"{name}: {e}")
        if template_fn is not None:
            return LLMResult(template_fn(), "template", "deterministic")
        raise RuntimeError("No LLM provider available and no template fallback. " + "; ".join(errors))

    @property
    def has_live_provider(self) -> bool:
        return bool(self.gemini_key or self.groq_key)
