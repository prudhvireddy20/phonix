# Phonix — System Architecture Document

**Project:** Phonix — Dockerized English Pronunciation Coach  
**Version:** 1.0.0  
**Date:** July 2026  
**Author:** Prudhvi Reddy

---

## 1. Executive Summary

Phonix is a fully self-hosted, privacy-first English pronunciation coaching web application. Users upload audio recordings of themselves reading English text, and the system provides real-time phoneme-level scoring, error classification, and AI-generated coaching feedback — all delivered via a streaming interface.

**Key Differentiators:**
- All audio processing happens on-device (no audio leaves the server)
- Fully Dockerized — five containers, single `docker compose up`
- DPDP 2023 (India's Digital Personal Data Protection Act) compliant by design
- Zero vendor lock-in — every service is self-hosted or swappable

---

## 2. Architecture Overview

### 2.1 Architecture Style

Phonix follows a **Hexagonal Architecture** (Ports & Adapters) on the backend, with a clear separation between:

| Layer | Purpose | Dependencies |
|---|---|---|
| **Domain** | Pure business logic (models, scoring) | None (plain Python) |
| **Application** | Use case orchestration | Domain layer only |
| **Adapters** | External integrations (MinIO, Postgres, Whisper, LLM) | Implements domain Ports |
| **API** | HTTP route handlers (FastAPI) | Application layer |

### 2.2 High-Level System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (Client)                    │
│  Next.js React SPA — upload, consent, SSE result stream  │
└───────────────┬─────────────────────────────┬────────────┘
                │  HTTP :80/:443              │
                ▼                             │
┌──────────────────────────────┐              │
│     Nginx Reverse Proxy      │              │
│  (TLS termination, routing)  │              │
└──┬────────┬────────┬─────────┘              │
   │        │        │                        │
   │ /      │/api/*  │/storage/*              │
   ▼        ▼        ▼                        │
┌──────┐ ┌──────┐ ┌──────┐                   │
│ Next │ │ Fast │ │MinIO │ ◄── presigned PUT ─┘
│  .js │ │ API  │ │ (S3) │
│:3000 │ │:8000 │ │:9000 │
└──────┘ └──┬───┘ └──────┘
            │
    ┌───────┼───────────┐
    │       │           │
    ▼       ▼           ▼
┌──────┐ ┌──────┐ ┌──────────────┐
│Whis- │ │Post- │ │ OpenRouter   │
│per   │ │gres  │ │ (LLM API)   │
│(local│ │:5432 │ │ text only    │
│ CPU) │ │      │ │              │
└──────┘ └──────┘ └──────────────┘
```

---

## 3. Service Inventory

### 3.1 Container Services

| Service | Image / Build | Port | Purpose | Restart |
|---|---|---|---|---|
| **nginx** | `nginx:1.27-alpine` | 80, 443 | Reverse proxy, TLS, security headers | `unless-stopped` |
| **frontend** | Node 20 + Next.js (multi-stage) | 3000 (internal) | Browser UI — upload, consent, results | `unless-stopped` |
| **api** | Python 3.11 + FastAPI (multi-stage) | 8000 (internal) | Analysis pipeline, SSE streaming | `unless-stopped` |
| **minio** | `minio/minio` | 9000, 9001 | S3-compatible object storage for audio | `unless-stopped` |
| **minio_init** | `minio/mc` | — | One-shot bucket bootstrap + lifecycle | `no` |
| **postgres** | `postgres:16-alpine` | 5432 (internal) | DPDP audit log | `unless-stopped` |

### 3.2 Docker Volumes

| Volume | Purpose | Retention |
|---|---|---|
| `minio_data` | Audio uploads (ephemeral by design) | Purged every hour via lifecycle rule |
| `postgres_data` | Audit log for DPDP compliance | Retained permanently |
| `whisper_cache` | faster-whisper model cache | Survives restarts |

### 3.3 Network

All services communicate over a single Docker bridge network (`phonix`). No service ports are exposed to the host except Nginx (80/443) and MinIO console (9001, dev only).

---

## 4. Request Flow & Data Pipeline

### 4.1 Presigned Upload Flow (MinIO Mode)

```
1. Browser → POST /api/presign → FastAPI
   • Validates consent (essential_processing required)
   • Validates MIME type (audio/* or video/*)
   • Generates MinIO presigned PUT URL
   • Writes CONSENT_GIVEN audit event (hashed IP + file key)
   • Returns {file_key, upload_url}

2. Browser → PUT /storage/{bucket}/{key} → Nginx → MinIO
   • Audio bytes go directly to MinIO (bypass FastAPI)
   • Max upload: 55 MB (nginx client_max_body_size)

3. Browser → POST /api/analyze → FastAPI (SSE stream)
   • See §4.3 Analysis Pipeline below
```

### 4.2 Direct Upload Flow (Cloud/Production Mode)

```
1. Browser → POST /api/upload (multipart) → FastAPI
   • Validates consent, MIME type, file size (50 MB max)
   • Saves to local temp directory
   • Writes CONSENT_GIVEN audit event
   • Returns {file_key}

2. Browser → POST /api/analyze → FastAPI (SSE stream)
```

### 4.3 Analysis Pipeline (AnalyzeUseCase)

```
 Step 1: Download        → Fetch audio from MinIO or local storage
 Step 2: FFmpeg re-encode → Convert any format to 16 kHz mono WAV
 Step 3: Duration gate   → Reject < 30s or > 45s (assignment spec)
 Step 4: Transcribe      → faster-whisper (on-device, word timestamps)
         ↳ SSE: {"type": "transcript", "text": "..."}
 Step 5: Phoneme scoring → IPA conversion + Levenshtein distance
         ↳ SSE: {"type": "score", "overall": 87.3}
         ↳ SSE: {"type": "flag", ...} (per-word errors)
 Step 6: Delete audio    → Immediate deletion (DPDP compliance)
 Step 7: LLM feedback    → Stream tokens from OpenRouter
         ↳ SSE: {"type": "feedback", "token": "..."}
         ↳ SSE: {"type": "done"}
```

### 4.4 SSE Event Schema

| Event Type | Payload | Description |
|---|---|---|
| `transcript` | `{text}` | Whisper transcription result |
| `score` | `{overall}` | Overall pronunciation score (0–100) |
| `flag` | `{word, ipa_expected, ipa_actual, score, mistake_type, suggestion}` | Per-word phoneme error |
| `feedback` | `{token}` | Streaming LLM coaching token |
| `feedback_error` | `{message}` | LLM failed (scoring still shown) |
| `done` | `{}` | Stream complete |
| `error` | `{message}` | Fatal pipeline error |

---

## 5. Backend Architecture (Hexagonal / Ports & Adapters)

### 5.1 Domain Layer (`domain/`)

**Models** (`models.py`):
- `ConsentRecord` — essential + analytics consent flags, hashed IP
- `PhonemeFlag` — per-word scoring result (word, IPA expected/actual, score, mistake type)
- `PronunciationResult` — transcript + overall score + flags
- `AuditEvent` — event type + hashed file key + hashed IP + metadata
- `MistakeType` enum: `MISPRONOUNCED`, `UNCLEAR_SEGMENT`, `OMISSION`, `INSERTION`
- `AuditEventType` enum: `CONSENT_GIVEN`, `UPLOAD_STARTED`, `ANALYSIS_COMPLETE`, `AUDIO_DELETED`

**Phoneme Scorer** (`phoneme_scorer.py`):
- IPA conversion via `phonemizer` (espeak-ng) with CMU dictionary fallback
- Normalised Levenshtein distance on IPA character sequences
- Greedy left-to-right alignment of reference tokens to Whisper tokens
- Mistake classification heuristics (score thresholds, length ratios)

**Ports** (`ports.py`) — abstract interfaces:
- `StoragePort` — `generate_presigned_upload_url()`, `download_file()`, `delete_file()`
- `TranscriptionPort` — `transcribe(audio_bytes) → {text, words[]}`
- `FeedbackPort` — `stream_feedback() → AsyncGenerator[str]`
- `AuditPort` — `write(AuditEvent)`

### 5.2 Application Layer (`application/`)

| Use Case | Responsibility |
|---|---|
| `PresignUseCase` | Validate consent → validate MIME → generate presigned URL → audit |
| `AnalyzeUseCase` | Full pipeline: download → ffmpeg → whisper → score → delete → LLM stream |
| `CleanupUseCase` | Scheduled orphan file deletion (belt-and-suspenders) |

### 5.3 Adapter Layer (`adapters/`)

| Adapter | Implements | Technology |
|---|---|---|
| `MinioStorageAdapter` | `StoragePort` | MinIO Python SDK, presigned URL rewriting |
| `LocalStorageAdapter` | `StoragePort` | Local temp file system (cloud mode) |
| `PostgresAuditAdapter` | `AuditPort` | asyncpg connection pool, JSONB metadata |
| `FasterWhisperAdapter` | `TranscriptionPort` | CTranslate2 runtime, VAD filter, word timestamps |
| `OpenRouterAdapter` | `FeedbackPort` | httpx streaming, OpenAI-compatible SSE |

### 5.4 Dependency Injection (`dependencies.py`)

Storage mode is auto-detected: if `MINIO_ENDPOINT` env var exists → MinIO, otherwise → local temp files. All adapters are singletons via `@lru_cache(maxsize=1)`. FastAPI routes use `Depends()` for injection.

---

## 6. Frontend Architecture

### 6.1 Technology

- **Framework:** Next.js 15 (App Router, React Server Components)
- **Build:** Multi-stage Docker (node:20-alpine), standalone output
- **Styling:** CSS custom properties (design tokens in `globals.css`)

### 6.2 UI Phase State Machine

```
idle → consent → running → done
                    ↓
                  error → idle (retry)
```

### 6.3 Component Tree

| Component | Purpose |
|---|---|
| `page.tsx` | Phase state machine, layout orchestration |
| `UploadZone` | Drag-and-drop / file picker with audio validation |
| `ConsentDialog` | DPDP two-checkbox consent modal (essential + analytics) |
| `AnalyzingScreen` | Loading animation during pipeline execution |
| `ResultsView` | Score ring, word highlights, feedback display |
| `ScoreRing` | Animated circular score indicator (0–100) |
| `WordHighlight` | Colour-coded word-by-word pronunciation display |
| `FeedbackPanel` | Streaming LLM coaching text with typewriter effect |
| `AudioPlayer` | Playback of the uploaded recording |
| `WaveformBar` | Audio waveform visualisation |

### 6.4 Custom Hooks

| Hook | Purpose |
|---|---|
| `useAnalysis` | Manages upload → analyze → SSE parsing state machine |
| `useAudioValidator` | Client-side audio duration and format validation |

---

## 7. Infrastructure & Deployment

### 7.1 Nginx Reverse Proxy Routing

| Path | Upstream | Purpose |
|---|---|---|
| `/` | `frontend:3000` | Next.js SPA |
| `/api/*` | `api:8000` | FastAPI endpoints |
| `/health` | `api:8000` | Liveness check |
| `/storage/*` | `minio:9000` | Presigned audio uploads |

### 7.2 Security Headers (Nginx)

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin`
- `Permissions-Policy: microphone=(self)`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`

### 7.3 Production Deployment (`docker-compose.prod.yml`)

Stripped-down stack for 1 GB RAM VPS (UpCloud):
- **No MinIO** — uses `LocalStorageAdapter` (direct upload)
- **No Postgres container** — uses Neon (managed Postgres, free tier)
- **Whisper tiny model** (75 MB) instead of base (145 MB)
- Memory limits: API 512 MB, Frontend 200 MB, Nginx 32 MB

### 7.4 Multi-Stage Docker Builds

**Backend Dockerfile:**
1. `builder` stage — compile Python C extensions
2. `runtime` stage — slim image with ffmpeg + espeak-ng + curl
3. Whisper model pre-downloaded into image layer (no cold start)

**Frontend Dockerfile:**
1. `deps` stage — `npm ci`
2. `builder` stage — `npm run build` (standalone output)
3. `runtime` stage — only `server.js` + static assets

---

## 8. Security Architecture

### 8.1 Application Security

| Measure | Implementation |
|---|---|
| **Rate Limiting** | slowapi: 5 req/min per IP on `/api/*` routes |
| **CORS** | Configurable allowed origins (`ALLOWED_ORIGINS` env var) |
| **MIME Validation** | Whitelist of audio/video MIME types (server-side) |
| **File Size Limit** | 50 MB (FastAPI) + 55 MB (Nginx `client_max_body_size`) |
| **Security Headers** | Applied at both Nginx and FastAPI middleware layers |
| **Input Sanitization** | Pydantic v2 models with field validators |
| **API Keys** | Server-side only — never exposed to client |

### 8.2 PII Protection

| Data | Protection |
|---|---|
| Client IP | SHA-256 hashed before any storage or logging |
| File storage key | SHA-256 hashed before audit log write |
| Audio content | Never stored — deleted immediately after analysis |
| Transcription text | Processed in-memory, not persisted |

---

## 9. DPDP 2023 Compliance Matrix

| DPDP Requirement | Implementation |
|---|---|
| **Consent (§6)** | Two-checkbox modal: essential (required) + analytics (optional). Neither pre-ticked. |
| **Purpose Limitation (§4)** | Audio used only for pronunciation scoring, then deleted. |
| **Data Minimisation (§8)** | faster-whisper on-device — audio never sent to third party. LLM receives text only. |
| **Retention** | Audio deleted immediately after `AnalyzeUseCase`. MinIO lifecycle: 1-day hard delete failsafe. Duration enforced: 30–45 seconds. |
| **Data Residency** | All data stays on the Docker host server. Operator chooses the country. |
| **PII in Logs** | IP and file key are SHA-256 hashed. Raw values never stored. |
| **Audit Trail** | Every stage writes to `audit_log`: CONSENT → UPLOAD → ANALYSIS → DELETED. |
| **Sub-processors** | OpenRouter/LLM for text feedback only. No sub-processor for audio or storage. |
| **User Notice** | Results page shows: "Your audio has been deleted from our servers." |

---

## 10. Database Schema

### 10.1 `audit_log` Table (PostgreSQL 16)

```sql
CREATE TABLE audit_log (
    id             bigserial    PRIMARY KEY,
    event_type     text         NOT NULL,
    file_key_hash  text         NOT NULL,    -- SHA-256
    ip_hash        text         NOT NULL,    -- SHA-256
    metadata       jsonb        NOT NULL DEFAULT '{}',
    occurred_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_file_key ON audit_log (file_key_hash);
CREATE INDEX idx_audit_occurred ON audit_log (occurred_at DESC);
```

**Design Notes:**
- No raw PII stored — only hashed identifiers
- JSONB `metadata` stores variable per-event data (duration, score, consent flags)
- `occurred_at DESC` index for compliance officer time-range queries
- Write-only from application — no UPDATE/DELETE operations

---

## 11. Technology Stack Summary

| Layer | Technology | Version |
|---|---|---|
| **Frontend Framework** | Next.js (App Router) | 15.x |
| **Frontend Runtime** | Node.js | 20 (Alpine) |
| **Backend Framework** | FastAPI | 0.115.5 |
| **Backend Runtime** | Python | 3.11 (Slim) |
| **ASGI Server** | Uvicorn | 0.32.1 |
| **Speech-to-Text** | faster-whisper (CTranslate2) | 1.1.0 |
| **IPA Phonemization** | phonemizer + espeak-ng | 3.3.0 |
| **String Comparison** | python-Levenshtein | 0.26.1 |
| **LLM Gateway** | OpenRouter (OpenAI-compatible) | — |
| **Default LLM** | Google Gemini 2.5 Flash | — |
| **Object Storage** | MinIO | 2024-11-07 |
| **Database** | PostgreSQL | 16 (Alpine) |
| **DB Driver** | asyncpg | 0.30.0 |
| **HTTP Client** | httpx | 0.27.2 |
| **Rate Limiting** | slowapi | 0.1.9 |
| **Reverse Proxy** | Nginx | 1.27 (Alpine) |
| **Containerisation** | Docker Compose | v3.9 |

---

## 12. Scaling Strategy

| Component | Current | Scale Path |
|---|---|---|
| **API** | Single container | Stateless — multiple replicas behind Nginx `upstream` with `least_conn` |
| **MinIO** | Single node | 4-node cluster for erasure coding, or swap to AWS S3 (one adapter change) |
| **Postgres** | Single container or Neon | Managed Postgres (RDS, Neon) — change `POSTGRES_DSN` only |
| **Whisper** | CPU (int8) | GPU instance with `WHISPER_DEVICE=cuda`, `WHISPER_COMPUTE_TYPE=float16` |
| **Frontend** | Single container | CDN-backed static export or multiple replicas |

---

## 13. Trade-offs and Design Decisions

| Decision | What we chose | Why | What we gave up |
|---|---|---|---|
| **On-device Whisper (CPU, int8)** | faster-whisper `tiny` on the VPS | Zero audio egress — strongest DPDP posture. No per-request API cost. | Accuracy: `tiny` WER is ~2× worse than `large-v3`. GPU would cut latency 5×, but adds cost. |
| **Hexagonal architecture** | Ports & Adapters with dependency injection | Swapping MinIO ↔ local ↔ S3 required changing one adapter, zero business logic. Same for Postgres ↔ Neon. | More files and indirection than a flat FastAPI app — overkill for a solo project, but pays off if the product grows. |
| **OpenRouter for LLM feedback** | OpenRouter gateway → Gemini 2.5 Flash | Model-agnostic — swap to Claude, GPT-4o, or Llama with one env var change. | Extra hop vs. calling Gemini directly. Adds ~200ms latency per request. |
| **IPA + Levenshtein scoring** | phonemizer (espeak-ng) + normalised edit distance | Deterministic, explainable, no model fine-tuning needed. Works offline. | Not as accurate as a trained phoneme classifier (e.g. wav2vec2-based). Misses prosody and intonation entirely. |
| **No user accounts** | Stateless — no login, no stored profiles | Minimises PII surface. Faster to ship. DPDP-friendly (less data = less risk). | No progress tracking across sessions. A returning learner starts from scratch. |
| **Self-hosted MinIO (dev) / local temp (prod)** | Local storage on VPS for production | No external storage sub-processor to declare under DPDP. Simpler infra on 1 GB RAM. | No CDN, no redundancy. If the VPS disk dies, ephemeral audio is lost (acceptable — audio is deleted within seconds anyway). |
| **SSE streaming (not WebSocket)** | Server-Sent Events for real-time results | Simpler than WebSocket — unidirectional, auto-reconnect, works through most proxies. | No bidirectional communication. If we needed live mic streaming, we'd need WebSocket. |
| **ngrok tunnel for deployment** | Free ngrok tunnel to UpCloud VPS | Fast setup, no domain registration needed. HTTPS included. | URL changes on restart. Free tier has interstitial warning page. Not production-grade. |

---

## 14. What We Would Build Next (One More Week)

| Priority | Feature | Why it matters |
|---|---|---|
| **P0** | **Custom domain + Let's Encrypt** | Eliminate the ngrok interstitial. Stable URL for production use. |
| **P0** | **GPU-backed Whisper (`small` or `medium`)** | 3–5× accuracy improvement. Move to a GPU VPS or use a Whisper API with a data processing agreement. |
| **P1** | **Live microphone recording** | Users shouldn't need a separate app to record. WebRTC `getUserMedia()` → record → upload in one flow. |
| **P1** | **Wav2vec2 phoneme classifier** | Replace Levenshtein heuristic with a trained model (e.g. `facebook/wav2vec2-lv-60-espeak-cv-ft`) for sub-phoneme accuracy. |
| **P1** | **User accounts + progress dashboard** | Track scores over time, show improvement trends. Requires DPDP consent for profile storage. |
| **P2** | **Prosody and intonation analysis** | Score rhythm, stress patterns, and pitch contour — not just individual phonemes. Use pitch tracking (WORLD vocoder or Praat). |
| **P2** | **Multi-language support** | Whisper already supports 99 languages. Extend phoneme scoring to Hindi-English, Spanish, Mandarin. |
| **P2** | **Reference text auto-generation** | LLM generates age/level-appropriate passages. Eliminates the need for users to paste their own text. |
| **P3** | **Mobile app (React Native)** | Native mic access, offline Whisper via `whisper.cpp`, push notifications for practice reminders. |
| **P3** | **A/B evaluation framework** | Compare scoring algorithms (Levenshtein vs. wav2vec2 vs. LLM-as-judge) on a labelled dataset. |

---

*End of Document*
