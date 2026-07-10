"""
Dependency injection — wires concrete adapters into use cases.
FastAPI routes call get_presign_uc() / get_analyze_uc() via Depends().

Storage  : MinIO (on-premise S3)   — no third-party storage sub-processor
Audit    : Postgres (asyncpg)       — full data sovereignty
Whisper  : faster-whisper (on-device) — no OPENAI_API_KEY needed
Feedback : OpenRouter (streaming, OpenAI-compatible gateway)
"""
from __future__ import annotations

import os
from functools import lru_cache

from app.adapters.openrouter_adapter import OpenRouterAdapter
from app.adapters.storage_adapter import MinioStorageAdapter, PostgresAuditAdapter
from app.adapters.whisper_adapter import FasterWhisperAdapter
from app.application.use_cases import AnalyzeUseCase, PresignUseCase

_REQUIRED_ENV = [
    "MINIO_ENDPOINT",
    "MINIO_ACCESS_KEY",
    "MINIO_SECRET_KEY",
    "MINIO_BUCKET",
    "POSTGRES_DSN",
    "ALLOWED_ORIGINS",
]


def check_env() -> list[str]:
    """Return list of missing required env vars (empty = all present)."""
    return [k for k in _REQUIRED_ENV if not os.getenv(k)]


# ── Singleton adapters (one instance per process) ─────────────────────────────

@lru_cache(maxsize=1)
def _storage() -> MinioStorageAdapter:
    return MinioStorageAdapter()


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
