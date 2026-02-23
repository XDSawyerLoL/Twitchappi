from __future__ import annotations
import os
from typing import Optional, Dict, Any

class LLMResponse(dict):
    pass

class LLMClient:
    def __init__(self):
        self.openai_key = os.getenv("OPENAI_API_KEY")
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-5")
        self.mistral_key = os.getenv("MISTRAL_API_KEY")
        self.mistral_model = os.getenv("MISTRAL_MODEL", "mistral-large-latest")
        self.gemini_key = os.getenv("GEMINI_API_KEY")
        self.gemini_model = os.getenv("GEMINI_MODEL", "gemini-1.5-pro")

    async def complete(self, system: str, user: str, temperature: float = 0.2) -> LLMResponse:
        # Provider selection: OpenAI -> Mistral -> Gemini
        # This repo is intentionally "bring-your-own-sdk" to keep it portable.
        # Implementations are stubs with clear TODOs.
        if self.openai_key:
            return await self._openai(system, user, temperature)
        if self.mistral_key:
            return await self._mistral(system, user, temperature)
        if self.gemini_key:
            return await self._gemini(system, user, temperature)
        raise RuntimeError("No LLM API key configured. Set OPENAI_API_KEY or MISTRAL_API_KEY or GEMINI_API_KEY.")

    async def _openai(self, system: str, user: str, temperature: float) -> LLMResponse:
        # TODO: integrate official OpenAI SDK
        # Kept minimal; return structure compatible with planner.
        return LLMResponse({"provider": "openai", "model": self.openai_model, "text": "(stub) Configure OpenAI SDK to generate patches."})

    async def _mistral(self, system: str, user: str, temperature: float) -> LLMResponse:
        return LLMResponse({"provider": "mistral", "model": self.mistral_model, "text": "(stub) Configure Mistral SDK to generate patches."})

    async def _gemini(self, system: str, user: str, temperature: float) -> LLMResponse:
        return LLMResponse({"provider": "gemini", "model": self.gemini_model, "text": "(stub) Configure Gemini SDK to generate patches."})
