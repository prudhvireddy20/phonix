"""
OpenRouterAdapter — implements FeedbackPort using OpenRouter's streaming API.

OpenRouter provides a unified OpenAI-compatible gateway to many LLMs.
The user sets OPENROUTER_API_KEY and optionally OPENROUTER_MODEL.

Streams token-by-token coaching feedback about pronunciation errors.
"""
from __future__ import annotations

import json
import logging
import os
from typing import AsyncGenerator

import httpx

from app.domain.models import PhonemeFlag
from app.domain.ports import FeedbackPort

logger = logging.getLogger(__name__)

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_DEFAULT_MODEL  = "google/gemini-2.5-flash"


def _build_prompt(
    reference_text: str,
    transcript:     str,
    flags:          list[PhonemeFlag],
    overall_score:  float,
) -> str:
    flag_lines = "\n".join(
        f'- "{f.word}": expected /{f.expected_ipa}/, heard /{f.actual_ipa}/ '
        f'(score {f.phoneme_score:.0%}) — {f.mistake_type.value}. {f.suggestion}'
        for f in flags[:12]  # cap to avoid token bloat
    ) or "No significant errors detected."

    return f"""You are a warm, encouraging English pronunciation coach. A learner has just completed a reading exercise.

REFERENCE TEXT (what they were meant to say):
{reference_text or "(no reference — scoring against own transcript)"}

WHAT WAS HEARD (Whisper transcript):
{transcript}

OVERALL SCORE: {overall_score:.0f}/100

PRONUNCIATION FLAGS:
{flag_lines}

Give concise, actionable feedback (3–4 short paragraphs). Structure:
1. One encouraging opening sentence about what they did well.
2. The 1–2 most important pronunciation patterns to work on, with a specific technique.
3. A practical drill or tip they can do today.
4. A brief motivating close.

Do NOT repeat the IPA codes verbatim — explain them in plain English. Be specific, not generic."""


class OpenRouterAdapter(FeedbackPort):
    def __init__(self):
        self.api_key = os.environ.get("OPENROUTER_API_KEY", "")
        self.model   = os.environ.get("OPENROUTER_MODEL", _DEFAULT_MODEL)

    @property
    def is_configured(self) -> bool:
        """Return True if a real API key is present."""
        return bool(self.api_key and self.api_key != "sk-or-your-key-here")

    async def stream_feedback(
        self,
        reference_text: str,
        transcript:     str,
        flags:          list[PhonemeFlag],
        overall_score:  float,
    ) -> AsyncGenerator[str, None]:
        if not self.is_configured:
            logger.warning("OpenRouter API key not configured — skipping LLM feedback.")
            return

        prompt  = _build_prompt(reference_text, transcript, flags, overall_score)
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type":  "application/json",
            "HTTP-Referer":  "https://phonix.app",
            "X-Title":       "Phonix Pronunciation Coach",
        }
        body = {
            "model":      self.model,
            "max_tokens": 600,
            "stream":     True,
            "messages":   [{"role": "user", "content": prompt}],
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST", _OPENROUTER_URL, headers=headers, json=body
            ) as resp:
                resp.raise_for_status()

                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if raw in ("", "[DONE]"):
                        continue
                    try:
                        evt = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    # OpenAI-compatible streaming format
                    choices = evt.get("choices", [])
                    if not choices:
                        continue

                    delta = choices[0].get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        yield content

                    # Stop if finish_reason is set
                    if choices[0].get("finish_reason"):
                        break

                    # Handle error events
                    if "error" in evt:
                        error_msg = evt["error"].get("message", "Unknown error")
                        logger.error("OpenRouter API error: %s", error_msg)
                        raise RuntimeError(f"OpenRouter API error: {error_msg}")
