"""
Application layer — use cases orchestrate domain logic and ports.
No framework imports here (FastAPI, Supabase etc. stay in adapters/api).
"""
from __future__ import annotations

import asyncio
import io
import logging
import subprocess
import tempfile
import uuid
from typing import AsyncGenerator

from app.domain.models import (
    AuditEvent,
    AuditEventType,
    ConsentRecord,
    PhonemeFlag,
    PronunciationResult,
    sha256_hash,
)
from app.domain.phoneme_scorer import align_and_score
from app.domain.ports import AuditPort, FeedbackPort, StoragePort, TranscriptionPort

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# PresignUseCase
# ─────────────────────────────────────────────────────────────────────────────

class PresignUseCase:
    """
    Validate consent → issue a short-lived Supabase presigned upload URL.
    The browser then PUTs audio directly to Supabase (bypassing this server).
    """

    # Audio-only formats
    ALLOWED_AUDIO_MIME = {
        "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4",
        "audio/wav", "audio/x-wav", "audio/wave", "audio/aac",
        "audio/x-aac", "audio/flac", "audio/mp3", "audio/x-m4a",
    }
    # Video formats — ffmpeg extracts the audio track; video stream is discarded
    ALLOWED_VIDEO_MIME = {
        "video/mp4",         # .mp4 — most common phone/screen recording
        "video/quicktime",   # .mov — iPhone recordings
        "video/x-msvideo",  # .avi
        "video/webm",        # .webm video
        "video/x-matroska", # .mkv
    }
    ALLOWED_MIME_TYPES = ALLOWED_AUDIO_MIME | ALLOWED_VIDEO_MIME

    def __init__(self, storage: StoragePort, audit: AuditPort):
        self.storage = storage
        self.audit   = audit

    async def execute(
        self,
        consent: ConsentRecord,
        mime_type: str,
        ip_hash: str,
    ) -> dict:
        """
        Returns {"file_key": str, "upload_url": str}.
        Raises ValueError on consent or MIME violations.
        """
        if not consent.essential_processing:
            raise ValueError("Essential processing consent is required.")

        if mime_type not in self.ALLOWED_MIME_TYPES:
            raise ValueError(
                f"Unsupported MIME type '{mime_type}'. "
                f"Allowed: {sorted(self.ALLOWED_MIME_TYPES)}"
            )

        # Derive extension from MIME type so the stored object has the right suffix.
        # ffmpeg handles format detection by content, not extension, but a correct
        # suffix makes MinIO lifecycle rules and debugging easier.
        _EXT_MAP = {
            "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3",
            "audio/mp4": "m4a",   "audio/wav": "wav", "audio/x-wav": "wav",
            "audio/wave": "wav",  "audio/aac": "aac", "audio/x-aac": "aac",
            "audio/flac": "flac", "audio/mp3": "mp3", "audio/x-m4a": "m4a",
            "video/mp4": "mp4",   "video/quicktime": "mov",
            "video/x-msvideo": "avi", "video/webm": "webm",
            "video/x-matroska": "mkv",
        }
        ext      = _EXT_MAP.get(mime_type, "bin")
        file_key = f"audio/{uuid.uuid4().hex}.{ext}"
        upload_url = await self.storage.generate_presigned_upload_url(file_key)

        await self.audit.write(
            AuditEvent(
                event_type    = AuditEventType.CONSENT_GIVEN,
                file_key_hash = sha256_hash(file_key),
                ip_hash       = ip_hash,
                metadata      = {
                    "analytics_consent": consent.analytics_consent,
                    "mime_type": mime_type,
                },
            )
        )

        return {"file_key": file_key, "upload_url": upload_url}


# ─────────────────────────────────────────────────────────────────────────────
# AnalyzeUseCase
# ─────────────────────────────────────────────────────────────────────────────

class AnalyzeUseCase:
    """
    Full pipeline:
      download → ffmpeg re-encode → Whisper → phoneme diff → Claude SSE
    Audio is deleted immediately after processing (DPDP compliance).
    """

    MIN_DURATION = 1.0    # minimum 1s to reject empty/corrupt files
    MAX_DURATION = 50.0   # accept up to ~45s with some jitter headroom

    def __init__(
        self,
        storage    : StoragePort,
        transcriber: TranscriptionPort,
        feedback   : FeedbackPort,
        audit      : AuditPort,
    ):
        self.storage     = storage
        self.transcriber = transcriber
        self.feedback    = feedback
        self.audit       = audit

    # ── helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _convert_to_wav(raw_bytes: bytes) -> bytes:
        """Re-encode any audio format to 16 kHz mono WAV via ffmpeg."""
        with tempfile.NamedTemporaryFile(suffix=".input", delete=False) as inf:
            inf.write(raw_bytes)
            in_path = inf.name

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as outf:
            out_path = outf.name

        cmd = [
            "ffmpeg", "-y",
            "-i", in_path,
            "-vn",          # discard video stream — only keep audio track
            "-ar", "16000", # resample to 16 kHz (Whisper requirement)
            "-ac", "1",     # mono
            "-f", "wav",    # output format
            out_path,
        ]
        # Timeout raised to 120s for large MP4 video files
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            stderr_text = result.stderr.decode(errors="replace")
            # Detect video-only files (no audio track) and give a clear message
            if "does not contain any stream" in stderr_text:
                import os
                os.unlink(in_path)
                try:
                    os.unlink(out_path)
                except FileNotFoundError:
                    pass
                raise RuntimeError(
                    "The uploaded file contains no audio stream. "
                    "Please upload a recording that includes audio "
                    "(e.g. a voice memo or screen recording with microphone enabled)."
                )
            raise RuntimeError(f"ffmpeg failed: {stderr_text}")

        with open(out_path, "rb") as f:
            wav_bytes = f.read()

        import os
        os.unlink(in_path)
        os.unlink(out_path)
        return wav_bytes

    @staticmethod
    def _get_wav_duration(wav_bytes: bytes) -> float:
        """Read WAV header to get duration in seconds."""
        import struct
        if len(wav_bytes) < 44:
            return 0.0
        sample_rate   = struct.unpack_from("<I", wav_bytes, 24)[0]
        byte_rate     = struct.unpack_from("<I", wav_bytes, 28)[0]
        data_size     = len(wav_bytes) - 44
        if byte_rate == 0:
            return 0.0
        return data_size / byte_rate

    @staticmethod
    def _tokenise_reference(text: str) -> list[str]:
        import re
        return re.findall(r"[a-zA-Z']+", text)

    # ── main pipeline ─────────────────────────────────────────────────────────

    async def execute(
        self,
        file_key      : str,
        reference_text: str,
        ip_hash       : str,
    ) -> AsyncGenerator[str, None]:
        """
        Async generator that yields SSE-formatted strings.
        Caller (FastAPI route) forwards these directly to the client.

        SSE event schema (newline-delimited JSON inside "data:" lines):
          data: {"type": "transcript",  "text": "..."}
          data: {"type": "score",       "overall": 87.3}
          data: {"type": "flag",        "word": "...", "ipa_expected": "...", ...}
          data: {"type": "feedback",    "token": "..."}
          data: {"type": "done"}
          data: {"type": "error",       "message": "..."}
        """
        import json

        file_key_hash = sha256_hash(file_key)

        # ── 1. Download audio ─────────────────────────────────────────────
        try:
            raw_bytes = await self.storage.download_file(file_key)
        except Exception as exc:
            yield _sse({"type": "error", "message": f"Download failed: {exc}"})
            return

        # ── 2. Re-encode via ffmpeg ────────────────────────────────────────
        try:
            wav_bytes = await asyncio.get_event_loop().run_in_executor(
                None, self._convert_to_wav, raw_bytes
            )
        except Exception as exc:
            yield _sse({"type": "error", "message": f"Audio conversion failed: {exc}"})
            await self._delete(file_key, file_key_hash, ip_hash)
            return

        # ── 3. Duration gate ──────────────────────────────────────────────
        duration = self._get_wav_duration(wav_bytes)
        if not (self.MIN_DURATION <= duration <= self.MAX_DURATION):
            yield _sse({
                "type": "error",
                "message": (
                    f"Audio duration {duration:.1f}s is outside the allowed range. "
                    f"Please upload a recording up to 45 seconds."
                ),
            })
            await self._delete(file_key, file_key_hash, ip_hash)
            return

        # ── 4. Transcribe ─────────────────────────────────────────────────
        await self.audit.write(AuditEvent(
            event_type    = AuditEventType.UPLOAD_STARTED,
            file_key_hash = file_key_hash,
            ip_hash       = ip_hash,
            metadata      = {"duration_s": round(duration, 2)},
        ))

        try:
            result = await self.transcriber.transcribe(wav_bytes)
            transcript  = result["text"]
            whisper_words = result.get("words", [])
        except Exception as exc:
            yield _sse({"type": "error", "message": f"Transcription failed: {exc}"})
            await self._delete(file_key, file_key_hash, ip_hash)
            return

        yield _sse({"type": "transcript", "text": transcript})

        # ── 5. Phoneme scoring ────────────────────────────────────────────
        ref_tokens = self._tokenise_reference(reference_text)
        flags, overall_score = await asyncio.get_event_loop().run_in_executor(
            None, align_and_score, ref_tokens, whisper_words
        )

        yield _sse({"type": "score", "overall": overall_score})

        for flag in flags:
            yield _sse({
                "type"        : "flag",
                "word"        : flag.word,
                "ipa_expected": flag.expected_ipa,
                "ipa_actual"  : flag.actual_ipa,
                "start"       : flag.start_time,
                "end"         : flag.end_time,
                "score"       : flag.phoneme_score,
                "mistake_type": flag.mistake_type.value,
                "suggestion"  : flag.suggestion,
            })

        # ── 6. Delete audio immediately (DPDP) ───────────────────────────
        await self._delete(file_key, file_key_hash, ip_hash)

        # ── 7. LLM SSE feedback (non-blocking — scoring is shown even
        #        if LLM is unavailable or the API key is missing) ──────
        await self.audit.write(AuditEvent(
            event_type    = AuditEventType.ANALYSIS_COMPLETE,
            file_key_hash = file_key_hash,
            ip_hash       = ip_hash,
            metadata      = {
                "overall_score" : overall_score,
                "flag_count"    : len(flags),
            },
        ))

        try:
            async for token in self.feedback.stream_feedback(
                reference_text=reference_text,
                transcript    =transcript,
                flags         =flags,
                overall_score =overall_score,
            ):
                yield _sse({"type": "feedback", "token": token})
        except Exception as exc:
            # Log the failure but don't crash — the user still sees their score
            logger.warning("LLM feedback unavailable: %s", exc)
            yield _sse({"type": "feedback_error", "message": str(exc)})

        yield _sse({"type": "done"})

    # ── private ───────────────────────────────────────────────────────────────

    async def _delete(self, file_key: str, file_key_hash: str, ip_hash: str) -> None:
        try:
            await self.storage.delete_file(file_key)
        except Exception as exc:
            logger.error("Failed to delete %s: %s", file_key, exc)
        await self.audit.write(AuditEvent(
            event_type    = AuditEventType.AUDIO_DELETED,
            file_key_hash = file_key_hash,
            ip_hash       = ip_hash,
            metadata      = {},
        ))


# ─────────────────────────────────────────────────────────────────────────────
# CleanupUseCase  (cron / scheduled job)
# ─────────────────────────────────────────────────────────────────────────────

class CleanupUseCase:
    """
    Belt-and-suspenders: delete any audio files older than TTL that somehow
    survived the AnalyzeUseCase deletion step.
    Called by a scheduled task (e.g. Railway cron or APScheduler).
    """

    def __init__(self, storage: StoragePort, audit: AuditPort):
        self.storage = storage
        self.audit   = audit

    async def execute(self) -> int:
        """Returns number of orphan files deleted."""
        # Implementation depends on Supabase list() capabilities.
        # Skeleton provided; full impl in SupabaseAdapter.
        logger.info("CleanupUseCase.execute() called (stub)")
        return 0


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _sse(payload: dict) -> str:
    import json
    return f"data: {json.dumps(payload)}\n\n"
