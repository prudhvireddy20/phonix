"""
Ports (interfaces) — the hexagonal architecture contracts.
Adapters implement these; use cases depend only on these.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncGenerator

from app.domain.models import AuditEvent, PhonemeFlag


class StoragePort(ABC):
    @abstractmethod
    async def generate_presigned_upload_url(
        self, file_key: str, ttl_seconds: int = 3600
    ) -> str: ...

    @abstractmethod
    async def download_file(self, file_key: str) -> bytes: ...

    @abstractmethod
    async def delete_file(self, file_key: str) -> None: ...


class TranscriptionPort(ABC):
    @abstractmethod
    async def transcribe(
        self, audio_bytes: bytes, language: str = "en"
    ) -> dict: ...
    # Returns: {"text": str, "words": [{"word": str, "start": float, "end": float}]}


class FeedbackPort(ABC):
    @abstractmethod
    async def stream_feedback(
        self,
        reference_text: str,
        transcript:     str,
        flags:          list[PhonemeFlag],
        overall_score:  float,
    ) -> AsyncGenerator[str, None]: ...


class AuditPort(ABC):
    @abstractmethod
    async def write(self, event: AuditEvent) -> None: ...
