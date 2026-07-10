"""
Dependency injection — wires concrete adapters into use cases.
FastAPI routes call get_presign_uc() / get_analyze_uc() via Depends().

Storage  : MinIO (Docker) or LocalStorage (cloud) — auto-detected
Audit    : Postgres (asyncpg)       — full data sovereignty
Whisper  : faster-whisper (on-device) — no OPENAI_API_KEY needed
Feedback : OpenRouter (streaming, OpenAI-compatible gateway)
"""
from __future__ import annotations

import os
from functools import lru_cache

from app.adapters.openrouter_adapter import OpenRouterAdapter
from app.adapters.storage_adapter import PostgresAuditAdapter
from app.adapters.whisper_adapter import FasterWhisperAdapter
from app.application.use_cases import AnalyzeUseCase, PresignUseCase

# Auto-detect storage mode: MinIO if env vars present, otherwise local temp files
_USE_MINIO = bool(os.getenv("MINIO_ENDPOINT"))

_REQUIRED_ENV = [
    "POSTGRES_DSN",
    "ALLOWED_ORIGINS",
]

# Only require MinIO env vars if MinIO mode is active
if _USE_MINIO:
    _REQUIRED_ENV.extend([
        "MINIO_ENDPOINT",
        "MINIO_ACCESS_KEY",
        "MINIO_SECRET_KEY",
        "MINIO_BUCKET",
    ])


def check_env() -> list[str]:
    """Return list of missing required env vars (empty = all present)."""
    return [k for k in _REQUIRED_ENV if not os.getenv(k)]


# ── Singleton adapters (one instance per process) ─────────────────────────────

@lru_cache(maxsize=1)
def _storage():
    if _USE_MINIO:
        from app.adapters.storage_adapter import MinioStorageAdapter
        return MinioStorageAdapter()
    else:
        from app.adapters.local_storage_adapter import LocalStorageAdapter
        return LocalStorageAdapter()


@lru_cache(maxsize=1)
def _audit() -> PostgresAuditAdapter:
    return PostgresAuditAdapter()


@lru_cache(maxsize=1)
def _transcriber() -> FasterWhisperAdapter:
    return FasterWhisperAdapter()


@lru_cache(maxsize=1)
def _feedback() -> OpenRouterAdapter:
    return OpenRouterAdapter()


# ── FastAPI dependency callables ──────────────────────────────────────────────

def get_presign_uc() -> PresignUseCase:
    return PresignUseCase(storage=_storage(), audit=_audit())


def get_analyze_uc() -> AnalyzeUseCase:
    return AnalyzeUseCase(
        storage     = _storage(),
        transcriber = _transcriber(),
        feedback    = _feedback(),
        audit       = _audit(),
    )
