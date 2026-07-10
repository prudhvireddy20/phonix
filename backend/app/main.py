"""
FastAPI application factory.

Security layers (outermost-first):
  1. Rate limiting  — slowapi: 5 req/min per IP on /api/* routes
  2. CORS           — Vercel frontend domain only (configurable via env)
  3. MIME re-validation — done inside PresignUseCase
  4. API keys never sent to client — kept in env vars, used server-side only
"""
from __future__ import annotations

import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api.routes import router

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level  = logging.INFO,
    format = "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# ── Rate limiter ──────────────────────────────────────────────────────────────

limiter = Limiter(
    key_func        = get_remote_address,
    default_limits  = ["5/minute"],
    storage_uri     = os.getenv("REDIS_URL", "memory://"),
)

# ── Allowed CORS origins ──────────────────────────────────────────────────────

_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001",   # dev fallback
)
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]


# ── App factory ───────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(
        title       = "Livo AI — Pronunciation Analyser",
        description = (
            "Backend API for real-time English pronunciation scoring. "
            "Audio is processed server-side and deleted immediately after analysis "
            "in compliance with India's DPDP Act 2023."
        ),
        version     = "1.0.0",
        docs_url    = "/docs",
        redoc_url   = "/redoc",
    )

    # ── Rate limiting ─────────────────────────────────────────────────────────
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins     = ALLOWED_ORIGINS,
        allow_credentials = True,
        allow_methods     = ["GET", "POST", "OPTIONS"],
        allow_headers     = ["Content-Type", "Authorization"],
        expose_headers    = ["X-Request-Id"],
    )

    # ── Security headers middleware ───────────────────────────────────────────
    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"]        = "DENY"
        response.headers["Referrer-Policy"]        = "strict-origin-when-cross-origin"
        # Don't set HSTS here — Railway/Vercel handle TLS termination
        return response

    # ── Routes ────────────────────────────────────────────────────────────────
    app.include_router(router)

    # ── Startup log ───────────────────────────────────────────────────────────
    @app.on_event("startup")
    async def on_startup():
        from app.dependencies import check_env
        missing = check_env()
        if missing:
            logging.warning(
                "⚠️  Missing environment variables: %s — some features will be degraded.",
                missing,
            )
        else:
            logging.info("✅  All required environment variables present.")
        logging.info("🚀  Livo AI backend started. CORS origins: %s", ALLOWED_ORIGINS)

    return app


app = create_app()
