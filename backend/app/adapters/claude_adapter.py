"""
ClaudeAdapter — implements FeedbackPort using Anthropic's streaming Messages API.

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

_ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
_DEFAULT_MODEL  = "claude-haiku-4-5-20251001"


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


class ClaudeAdapter(FeedbackPort):
    def __init__(self):
        self.api_key = os.environ["ANTHROPIC_API_KEY"]
        self.model   = os.environ.get("CLAUDE_MODEL", _DEFAULT_MODEL)

    async def stream_feedback(
        self,
        reference_text: str,
        transcript:     str,
        flags:          list[PhonemeFlag],
        overall_score:  float,
    ) -> AsyncGenerator[str, None]:
        prompt  = _build_prompt(reference_text, transcript, flags, overall_score)
        headers = {
            "x-api-key":         self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type":      "application/json",
            "accept":            "text/event-stream",
        }
        body = {
            "model":      self.model,
            "max_tokens": 600,
            "stream":     True,
            "messages":   [{"role": "user", "content": prompt}],
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST", _ANTHROPIC_URL, headers=headers, json=body
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

                    evt_type = evt.get("type", "")

                    if evt_type == "content_block_delta":
                        delta = evt.get("delta", {})
                        if delta.get("type") == "text_delta":
                            yield delta.get("text", "")

                    elif evt_type == "message_stop":
                        break

                    elif evt_type == "error":
                        error_msg = evt.get("error", {}).get("message", "Unknown error")
                        logger.error("Claude API error: %s", error_msg)
                        raise RuntimeError(f"Claude API error: {error_msg}")
