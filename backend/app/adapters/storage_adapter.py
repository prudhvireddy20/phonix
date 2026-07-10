"""
MinioStorageAdapter  — implements StoragePort using MinIO (on-premise S3).
PostgresAuditAdapter — implements AuditPort using asyncpg + Postgres.

DPDP advantages over Supabase:
  • Audio bytes never leave your own server / VPC.
  • No third-party storage sub-processor to declare.
  • Audit log lives in your own Postgres instance — full data sovereignty.
"""
from __future__ import annotations

import io
import json
import logging
import os
from datetime import datetime, timezone
from urllib.parse import urlparse

import asyncpg
from minio import Minio
from minio.error import S3Error

from app.domain.models import AuditEvent
from app.domain.ports import AuditPort, StoragePort

logger = logging.getLogger(__name__)


# ── MinIO Storage Adapter ─────────────────────────────────────────────────────

class MinioStorageAdapter(StoragePort):
    """
    On-premise S3-compatible storage via MinIO.

    Environment variables:
      MINIO_ENDPOINT    — host:port of the MinIO server (e.g. minio:9000)
      MINIO_ACCESS_KEY  — root user / access key
      MINIO_SECRET_KEY  — root password / secret key
      MINIO_BUCKET      — bucket name (default: audio-uploads)
      MINIO_SECURE      — "true" for TLS, "false" for plain HTTP inside Docker
    """

    def __init__(self) -> None:
        endpoint   = os.environ["MINIO_ENDPOINT"]
        access_key = os.environ["MINIO_ACCESS_KEY"]
        secret_key = os.environ["MINIO_SECRET_KEY"]
        secure     = os.environ.get("MINIO_SECURE", "false").lower() == "true"

        self.bucket = os.environ.get("MINIO_BUCKET", "audio-uploads")
        self._client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )
        # Public base URL used to build presigned URLs the browser can reach.
        # Inside Docker, MinIO is at minio:9000; outside it's localhost:9000.
        # We expose the external URL via MINIO_PUBLIC_URL so presigned URLs
        # are reachable from the user's browser.
        raw = os.environ.get("MINIO_PUBLIC_URL", f"http://{endpoint}")
        self._public_url = raw.rstrip("/")

    # ── StoragePort ───────────────────────────────────────────────────────────

    async def generate_presigned_upload_url(
        self, file_key: str, ttl_seconds: int = 3600
    ) -> str:
        """
        Generate a presigned PUT URL so the browser uploads directly to MinIO
        without passing audio bytes through the FastAPI server.

        The minio-py client is synchronous; we call it inline since presign is
        pure CPU / crypto — no blocking I/O.
        """
        from datetime import timedelta

        url = self._client.presigned_put_object(
            self.bucket,
            file_key,
            expires=timedelta(seconds=ttl_seconds),
        )

        # Rewrite the internal Docker hostname to the public-facing URL so
        # the browser can actually reach the endpoint.
        parsed_internal = urlparse(url)
        parsed_public   = urlparse(self._public_url)
        # Replace scheme://host and prepend any path prefix (e.g. /storage)
        internal_origin = f"{parsed_internal.scheme}://{parsed_internal.netloc}"
        public_origin   = f"{parsed_public.scheme}://{parsed_public.netloc}"
        public_path_prefix = parsed_public.path.rstrip("/")
        public_url = url.replace(
            internal_origin,
            f"{public_origin}{public_path_prefix}",
        )
        return public_url

    async def download_file(self, file_key: str) -> bytes:
        """Download audio bytes from MinIO (server-side, stays on-premise)."""
        try:
            response = self._client.get_object(self.bucket, file_key)
            return response.read()
        except S3Error as exc:
            raise FileNotFoundError(
                f"MinIO: object '{file_key}' not found in '{self.bucket}'"
            ) from exc
        finally:
            try:
                response.close()
                response.release_conn()
            except Exception:
                pass

    async def delete_file(self, file_key: str) -> None:
        """
        Delete immediately after analysis — DPDP §8 data minimisation.
        404 is silently ignored (idempotent).
        """
        try:
            self._client.remove_object(self.bucket, file_key)
            logger.info("Deleted MinIO object: %s", file_key)
        except S3Error as exc:
            if exc.code == "NoSuchKey":
                logger.warning("MinIO delete: object already gone: %s", file_key)
            else:
                logger.error("MinIO delete failed for %s: %s", file_key, exc)
                raise


# ── Postgres Audit Adapter ────────────────────────────────────────────────────

class PostgresAuditAdapter(AuditPort):
    """
    Writes DPDP audit events to a Postgres table using asyncpg.

    Only file_key_hash and ip_hash are stored — raw values are never persisted.

    Environment variables:
      POSTGRES_DSN — e.g. postgresql://user:pass@postgres:5432/phonix
    """

    def __init__(self) -> None:
        self._dsn  = os.environ["POSTGRES_DSN"]
        self._pool: asyncpg.Pool | None = None

    async def _get_pool(self) -> asyncpg.Pool:
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                self._dsn,
                min_size=1,
                max_size=5,
                command_timeout=10,
            )
        return self._pool

    async def write(self, event: AuditEvent) -> None:
        """
        Insert one audit row. Failures are logged but never propagate —
        an audit hiccup must not crash the user-facing pipeline.
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO audit_log
                        (event_type, file_key_hash, ip_hash, metadata, occurred_at)
                    VALUES ($1, $2, $3, $4::jsonb, $5)
                    """,
                    event.event_type.value,
                    event.file_key_hash,
                    event.ip_hash,
                    json.dumps(event.metadata),  # proper JSON for Postgres JSONB column
                    datetime.now(timezone.utc),
                )
        except Exception as exc:
            logger.error(
                "Audit write failed: %s | event_type=%s", exc, event.event_type.value
            )
