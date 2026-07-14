"""
Unified LLM client (Phase 6): Gemini Flash primary → Groq Llama 3.3 70B fallback.

One `generate()` behind a stable interface so swapping providers is a config change.
When neither key is set (local dev / demo before keys exist), a deterministic
template writer is used so the whole agent graph still runs end-to-end. The provider
actually used is always returned, never hidden.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass
class LLMResult:
    text: str
    provider: str          # "gemini" | "groq" | "template"
    model: str


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
        if self.gemini_key:
            try:
                return LLMResult(self._gemini(system, prompt, temperature), "gemini", self.gemini_model)
            except Exception as e:  # rate limit / transient -> fall through
                errors.append(f"gemini: {e}")
        if self.groq_key:
            try:
                return LLMResult(self._groq(system, prompt, temperature), "groq", self.groq_model)
            except Exception as e:
                errors.append(f"groq: {e}")
        if template_fn is not None:
            return LLMResult(template_fn(), "template", "deterministic")
        raise RuntimeError("No LLM provider available and no template fallback. " + "; ".join(errors))

    @property
    def has_live_provider(self) -> bool:
        return bool(self.gemini_key or self.groq_key)
