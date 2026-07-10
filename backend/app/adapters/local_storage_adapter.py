"""
LocalStorageAdapter — implements StoragePort using local temp files.

Used in cloud deployments (Northflank, Fly.io, etc.) where MinIO is not available.
Audio is stored as temp files on the server filesystem, processed immediately,
and deleted right after analysis — never persisted.

DPDP advantage:
  • Audio bytes never leave the server process.
  • No third-party storage service involved at all.
  • Simplest possible data flow — upload → process → delete.
"""
from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path

from app.domain.ports import StoragePort

logger = logging.getLogger(__name__)

# Directory for temporary audio uploads
_UPLOAD_DIR = Path(tempfile.gettempdir()) / "phonix_uploads"
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class LocalStorageAdapter(StoragePort):
    """
    Server-local temp file storage. Audio is uploaded through the API,
    saved to a temp directory, and deleted after processing.

    No presigned URLs needed — the browser uploads directly to the FastAPI
    server via multipart form upload.
    """

    async def generate_presigned_upload_url(
        self, file_key: str, ttl_seconds: int = 3600
    ) -> str:
        """
        Not used in direct-upload mode. Returns a placeholder.
        The /api/upload endpoint handles file reception directly.
        """
        return f"direct://{file_key}"

    async def save_file(self, file_key: str, data: bytes) -> None:
        """Save uploaded bytes to local temp storage."""
        file_path = _UPLOAD_DIR / file_key.replace("/", "_")
        file_path.write_bytes(data)
        logger.info("Saved %d bytes to local storage: %s", len(data), file_key)

    async def download_file(self, file_key: str) -> bytes:
        """Read audio bytes from local temp storage."""
        file_path = _UPLOAD_DIR / file_key.replace("/", "_")
        if not file_path.exists():
            raise FileNotFoundError(
                f"Local storage: file '{file_key}' not found"
            )
        return file_path.read_bytes()

    async def delete_file(self, file_key: str) -> None:
        """
        Delete immediately after analysis — DPDP §8 data minimisation.
        Missing files are silently ignored (idempotent).
        """
        file_path = _UPLOAD_DIR / file_key.replace("/", "_")
        try:
            file_path.unlink(missing_ok=True)
            logger.info("Deleted local file: %s", file_key)
        except OSError as exc:
            logger.error("Local delete failed for %s: %s", file_key, exc)
            raise
