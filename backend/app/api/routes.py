"""
API route handlers.

Routes:
  GET  /health          — liveness check
  POST /api/presign     — validate consent + issue Supabase presigned URL
  POST /api/analyze     — run pipeline, stream SSE
"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from app.application.use_cases import AnalyzeUseCase, PresignUseCase
from app.dependencies import check_env, get_analyze_uc, get_presign_uc
from app.domain.models import ConsentRecord, sha256_hash

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Request/response schemas ───────────────────────────────────────────────────

class ConsentPayload(BaseModel):
    essential_processing: bool
    analytics_consent:    bool = False


class PresignRequest(BaseModel):
    consent:   ConsentPayload
    mime_type: str

    @field_validator("mime_type")
    @classmethod
    def strip_mime(cls, v: str) -> str:
        return v.split(";")[0].strip().lower()


class AnalyzeRequest(BaseModel):
    file_key:       str
    reference_text: str = ""


# ── /health ───────────────────────────────────────────────────────────────────

@router.get("/health", tags=["infra"])
async def health():
    missing = check_env()
    if missing:
        return {"status": "degraded", "missing_env": missing}
    return {"status": "ok"}


# ── /api/presign ──────────────────────────────────────────────────────────────

@router.post("/api/presign", tags=["api"])
async def presign(
    request: Request,
    body:    PresignRequest,
    uc:      Annotated[PresignUseCase, Depends(get_presign_uc)],
):
    """
    Validate consent and return a short-lived Supabase presigned upload URL.
    The browser then PUTs audio directly to Supabase (this server is bypassed).
    Rate-limited: 5 req/min per IP (slowapi, applied at app level).
    """
    client_ip = request.client.host if request.client else "unknown"
    ip_hash   = sha256_hash(client_ip)

    consent = ConsentRecord(
        essential_processing = body.consent.essential_processing,
        analytics_consent    = body.consent.analytics_consent,
        ip_hash              = ip_hash,
    )

    try:
        result = await uc.execute(consent, body.mime_type, ip_hash)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.exception("presign failed")
        raise HTTPException(status_code=500, detail="Could not generate upload URL.")

    return result


# ── /api/analyze ──────────────────────────────────────────────────────────────

@router.post("/api/analyze", tags=["api"])
async def analyze(
    request: Request,
    body:    AnalyzeRequest,
    uc:      Annotated[AnalyzeUseCase, Depends(get_analyze_uc)],
):
    """
    Full pipeline: download → ffmpeg → Whisper → phoneme diff → Claude SSE.
    Returns a text/event-stream response; audio is deleted after processing.

    SSE event types:
      transcript  — Whisper full text
      score       — overall_score (0–100)
      flag        — per-word phoneme error detail
      feedback    — Claude token (stream)
      done        — end of stream
      error       — pipeline error (terminates stream)
    """
    client_ip = request.client.host if request.client else "unknown"
    ip_hash   = sha256_hash(client_ip)

    if not body.file_key or not body.file_key.startswith("audio/"):
        raise HTTPException(status_code=422, detail="Invalid file_key.")

    async def event_generator():
        async for chunk in uc.execute(body.file_key, body.reference_text, ip_hash):
            yield chunk

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":      "no-cache",
            "X-Accel-Buffering":  "no",   # disable Nginx buffering for SSE
            "Connection":         "keep-alive",
        },
    )
