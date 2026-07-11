"""
API route handlers.

Routes:
  GET  /health          — liveness check
  GET  /api/sample-audio — TTS sample audio for demo
  POST /api/presign     — validate consent + issue presigned URL (MinIO mode)
  POST /api/upload      — direct multipart upload (cloud mode, no MinIO)
  POST /api/analyze     — run pipeline, stream SSE
"""
from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import tempfile
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, field_validator

from app.application.use_cases import AnalyzeUseCase, PresignUseCase
from app.dependencies import check_env, get_analyze_uc, get_presign_uc, _storage
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


# ── /api/sample-audio ─────────────────────────────────────────────────────────

_SAMPLE_TEXT = (
    "The North Wind and the Sun were disputing which was the stronger, "
    "when a traveller came along wrapped in a warm cloak. "
    "They agreed that the one who first succeeded in making the traveller "
    "take his cloak off should be considered stronger than the other. "
    "Then the North Wind blew as hard as he could, but the more he blew "
    "the more closely did the traveller fold his cloak around him. "
    "And at last the North Wind gave up the attempt."
)

_sample_cache: bytes | None = None


def _generate_sample_wav() -> bytes:
    """Generate sample TTS audio using espeak-ng. Result is cached in memory."""
    global _sample_cache
    if _sample_cache:
        return _sample_cache

    espeak_path = tempfile.mktemp(suffix=".wav")
    final_path  = tempfile.mktemp(suffix=".wav")

    try:
        subprocess.run(
            ["espeak-ng", "-v", "en-us", "-s", "120", "-p", "50", "-w", espeak_path, _SAMPLE_TEXT],
            check=True, timeout=30, capture_output=True,
        )
        subprocess.run(
            ["ffmpeg", "-y", "-i", espeak_path, "-ar", "16000", "-ac", "1", "-f", "wav", final_path],
            check=True, timeout=30, capture_output=True,
        )
        with open(final_path, "rb") as f:
            _sample_cache = f.read()
    finally:
        for p in [espeak_path, final_path]:
            try:
                os.unlink(p)
            except FileNotFoundError:
                pass

    return _sample_cache  # type: ignore[return-value]


@router.get("/api/sample-audio", tags=["api"])
async def sample_audio():
    """Return a TTS-generated sample English speech clip for demo/evaluation."""
    try:
        wav_bytes = await asyncio.get_event_loop().run_in_executor(None, _generate_sample_wav)
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={"Content-Disposition": 'inline; filename="phonix-sample.wav"'},
        )
    except Exception as exc:
        logger.exception("Sample audio generation failed")
        raise HTTPException(status_code=500, detail="Could not generate sample audio.")


# ── /api/presign ──────────────────────────────────────────────────────────────

@router.post("/api/presign", tags=["api"])
async def presign(
    request: Request,
    body:    PresignRequest,
    uc:      Annotated[PresignUseCase, Depends(get_presign_uc)],
):
    """
    Validate consent and return a short-lived presigned upload URL.
    The browser then PUTs audio directly to storage (this server is bypassed).
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


# ── /api/upload ───────────────────────────────────────────────────────────────

# Audio-only formats
_ALLOWED_AUDIO_MIME = {
    "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4",
    "audio/wav", "audio/x-wav", "audio/wave", "audio/aac",
    "audio/x-aac", "audio/flac", "audio/mp3", "audio/x-m4a",
}
# Video formats — ffmpeg extracts the audio track
_ALLOWED_VIDEO_MIME = {
    "video/mp4", "video/quicktime", "video/x-msvideo",
    "video/webm", "video/x-matroska",
}
_ALLOWED_MIME = _ALLOWED_AUDIO_MIME | _ALLOWED_VIDEO_MIME

# Extension map for file naming
_EXT_MAP = {
    "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3",
    "audio/mp4": "m4a",   "audio/wav": "wav", "audio/x-wav": "wav",
    "audio/wave": "wav",  "audio/aac": "aac", "audio/x-aac": "aac",
    "audio/flac": "flac", "audio/mp3": "mp3", "audio/x-m4a": "m4a",
    "video/mp4": "mp4",   "video/quicktime": "mov",
    "video/x-msvideo": "avi", "video/webm": "webm",
    "video/x-matroska": "mkv",
}

# Max upload size: 50MB (generous for 45s audio)
_MAX_UPLOAD_BYTES = 50 * 1024 * 1024


@router.post("/api/upload", tags=["api"])
async def upload(
    request: Request,
    file: UploadFile = File(...),
    consent_essential: bool = Form(True),
    consent_analytics: bool = Form(False),
):
    """
    Direct multipart file upload for cloud deployment (no MinIO/S3).
    Accepts the audio file, validates it, saves to local temp storage,
    and returns a file_key for use with /api/analyze.

    This replaces the presign → PUT flow when running without object storage.
    """
    client_ip = request.client.host if request.client else "unknown"
    ip_hash   = sha256_hash(client_ip)

    # ── Consent validation ────────────────────────────────────────────────
    if not consent_essential:
        raise HTTPException(
            status_code=422,
            detail="Essential processing consent is required."
        )

    # ── MIME type validation ──────────────────────────────────────────────
    mime_type = (file.content_type or "").split(";")[0].strip().lower()
    if mime_type not in _ALLOWED_MIME:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{mime_type}'. Please upload an audio file."
        )

    # ── Read and size-check ───────────────────────────────────────────────
    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(data) / 1024 / 1024:.1f}MB). Max is 50MB."
        )

    if len(data) == 0:
        raise HTTPException(status_code=422, detail="Empty file uploaded.")

    # ── Save to storage ───────────────────────────────────────────────────
    ext = _EXT_MAP.get(mime_type, "bin")
    file_key = f"audio/{uuid.uuid4().hex}.{ext}"

    storage = _storage()
    await storage.save_file(file_key, data)

    # ── Audit consent ─────────────────────────────────────────────────────
    from app.dependencies import _audit
    from app.domain.models import AuditEvent, AuditEventType

    await _audit().write(
        AuditEvent(
            event_type    = AuditEventType.CONSENT_GIVEN,
            file_key_hash = sha256_hash(file_key),
            ip_hash       = ip_hash,
            metadata      = {
                "analytics_consent": consent_analytics,
                "mime_type": mime_type,
                "size_bytes": len(data),
            },
        )
    )

    return {"file_key": file_key, "message": "Upload successful"}


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
