# Phonix — Dockerized English Pronunciation Coach

Full-stack, fully self-hosted pronunciation coaching app.  
Every service runs in Docker — no Supabase, no AWS, no third-party storage.

---

## Stack at a glance

| Service | Image | Purpose |
|---|---|---|
| **api** | Python 3.11 + FastAPI | Analysis pipeline, SSE stream |
| **frontend** | Node 20 + Next.js | Browser UI |
| **minio** | `minio/minio` | On-premise S3 object storage for audio |
| **postgres** | `postgres:16` | DPDP audit log |
| **nginx** | `nginx:1.27` | Reverse proxy, TLS termination |

---

## Why MinIO + Postgres instead of Supabase

| | Supabase | This setup |
|---|---|---|
| Audio storage | Supabase (US-based SaaS) | MinIO on your own server |
| Audit log | Supabase Postgres (SaaS) | Your own Postgres container |
| DPDP sub-processors | Supabase must be declared | None for storage or audit |
| Data residency | Supabase region (ap-southeast-1) | Wherever you run Docker |
| Cost at scale | Storage + egress fees | Free (your own infra) |
| Vendor lock-in | High | Zero — S3-compatible API |

Together with faster-whisper (on-device transcription), the only external API call in the entire pipeline is the Claude feedback call, which sends **text only** — no audio ever leaves your server.

---

## Project layout

```
phonix/
├── docker-compose.yml          ← full stack definition
├── .env                        ← all secrets and config (edit before running)
│
├── backend/
│   ├── Dockerfile              ← multi-stage Python build, pre-downloads Whisper
│   ├── requirements.txt
│   └── app/
│       ├── main.py             ← FastAPI factory (CORS, rate limiting)
│       ├── dependencies.py     ← DI wiring (MinIO + Postgres + Whisper + Claude)
│       ├── domain/
│       │   ├── models.py       ← PhonemeFlag, PronunciationResult, AuditEvent …
│       │   ├── ports.py        ← StoragePort, TranscriptionPort, FeedbackPort, AuditPort
│       │   └── phoneme_scorer.py ← IPA conversion + Levenshtein scoring
│       ├── application/
│       │   └── use_cases.py    ← PresignUseCase, AnalyzeUseCase, CleanupUseCase
│       ├── adapters/
│       │   ├── storage_adapter.py  ← MinioStorageAdapter + PostgresAuditAdapter
│       │   ├── whisper_adapter.py  ← FasterWhisperAdapter (on-device)
│       │   └── claude_adapter.py   ← Anthropic SSE streaming
│       └── api/
│           └── routes.py       ← /health  /api/presign  /api/analyze
│
├── frontend/
│   ├── Dockerfile              ← multi-stage Node build (standalone output)
│   ├── next.config.ts
│   └── app/
│       ├── globals.css         ← design tokens
│       ├── types.ts
│       ├── layout.tsx
│       ├── page.tsx            ← phase state machine
│       ├── hooks/
│       │   ├── useAudioValidator.ts
│       │   └── useAnalysis.ts
│       ├── components/
│       │   ├── UploadZone.tsx
│       │   ├── ConsentDialog.tsx
│       │   ├── WaveformBar.tsx
│       │   ├── AudioPlayer.tsx
│       │   ├── AnalyzingScreen.tsx
│       │   ├── ScoreRing.tsx
│       │   ├── WordHighlight.tsx
│       │   ├── FeedbackPanel.tsx
│       │   └── ResultsView.tsx
│       └── api/
│           ├── presign/route.ts
│           └── analyze/route.ts
│
└── infra/
    ├── postgres/
    │   └── init.sql            ← audit_log table, created on first boot
    └── nginx/
        ├── nginx.conf          ← reverse proxy + security headers
        └── certs/              ← mount your TLS certificates here
            ├── fullchain.pem
            └── privkey.pem
```

---

## Quick start

### 1. Clone and configure

```bash
git clone https://github.com/your-org/phonix.git
cd phonix
cp .env .env.local    # optional — docker-compose reads .env by default
```

Open `.env` and set at minimum:

```env
MINIO_ROOT_PASSWORD=change_this_now
POSTGRES_PASSWORD=change_this_too
ANTHROPIC_API_KEY=sk-ant-...
ALLOWED_ORIGINS=http://localhost
NEXT_PUBLIC_BACKEND_URL=http://localhost/api
```

### 2. Run (dev mode — HTTP only)

For local development, use the plain-HTTP nginx block.  
Open `infra/nginx/nginx.conf`, comment out the two HTTPS server blocks, and uncomment the HTTP dev block at the bottom. Then:

```bash
docker compose up --build
```

| URL | Service |
|---|---|
| `http://localhost` | Phonix app |
| `http://localhost/api/health` | FastAPI health |
| `http://localhost:9001` | MinIO console |

### 3. Run (production — HTTPS)

Place your TLS certificate files in `infra/nginx/certs/`:

```
infra/nginx/certs/
  fullchain.pem   ← your certificate + intermediates
  privkey.pem     ← your private key
```

Then update `.env`:

```env
ALLOWED_ORIGINS=https://yourdomain.com
NEXT_PUBLIC_BACKEND_URL=https://yourdomain.com/api
MINIO_PUBLIC_URL=https://yourdomain.com/storage
```

Then:

```bash
docker compose up -d --build
```

### 4. Get a free TLS cert with Certbot (optional)

```bash
# On the host (not inside Docker)
sudo apt install certbot
sudo certbot certonly --standalone -d yourdomain.com

sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem infra/nginx/certs/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem   infra/nginx/certs/

docker compose up -d
```

---

## Environment variables

All variables are read from `.env` in the project root.  
Docker Compose passes them to each service automatically.

### App secrets (required)

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key for streaming feedback |
| `MINIO_ROOT_PASSWORD` | MinIO admin password — change before first run |
| `POSTGRES_PASSWORD` | Postgres password — change before first run |
| `ALLOWED_ORIGINS` | Comma-separated frontend URLs for CORS |
| `NEXT_PUBLIC_BACKEND_URL` | Backend URL reachable from the browser |

### MinIO

| Variable | Default | Description |
|---|---|---|
| `MINIO_ROOT_USER` | `phonix` | MinIO admin username |
| `MINIO_ROOT_PASSWORD` | `phonix_secret_change_me` | **Change this** |
| `MINIO_PUBLIC_URL` | `http://localhost:9000` | External URL for presigned URLs (rewrite target) |

### Postgres

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_DB` | `phonix` | Database name |
| `POSTGRES_USER` | `phonix` | Database user |
| `POSTGRES_PASSWORD` | `phonix_pg_change_me` | **Change this** |

### Whisper

| Variable | Default | Description |
|---|---|---|
| `WHISPER_MODEL_SIZE` | `base` | `tiny` / `base` / `small` / `medium` |

Model sizes:
- `tiny` — 75 MB, ~1s per clip, lower accuracy
- `base` — 145 MB, ~2s per clip ← **recommended default**
- `small` — 480 MB, ~4s per clip, noticeably better
- `medium` — 1.5 GB, ~10s per clip, best accuracy (needs 4+ GB RAM)

The model is pre-downloaded into the Docker image during `docker compose build` and cached in the `whisper_cache` volume. It does not re-download on restarts.

### Claude

| Variable | Default | Description |
|---|---|---|
| `CLAUDE_MODEL` | `claude-haiku-4-5-20251001` | Any Anthropic model string |

---

## Service communication (inside Docker)

```
Browser
  │
  ▼
nginx (:80 / :443)
  ├── /          → frontend:3000   (Next.js)
  ├── /api/*     → api:8000        (FastAPI)
  ├── /health    → api:8000
  └── /storage/* → minio:9000      (presigned PUT from browser)

api:8000
  ├── minio:9000       (download + delete audio; generate presigned URL)
  ├── postgres:5432    (write audit rows)
  └── api.anthropic.com (Claude feedback — text only, no audio)
```

Presigned upload flow:
1. Browser → `POST /api/presign` → FastAPI → returns MinIO presigned URL
2. Browser → `PUT /storage/audio-uploads/...` → nginx → MinIO (audio bytes never touch FastAPI)
3. Browser → `POST /api/analyze` → FastAPI downloads from MinIO, processes, deletes, streams SSE

---

## Useful commands

```bash
# Start everything in the background
docker compose up -d

# Watch logs for all services
docker compose logs -f

# Watch only the api logs
docker compose logs -f api

# Rebuild just the api after code changes
docker compose up -d --build api

# Rebuild just the frontend
docker compose up -d --build frontend

# Stop everything (volumes are preserved)
docker compose down

# Stop and wipe all data (volumes deleted — destructive)
docker compose down -v

# Open a Postgres shell
docker compose exec postgres psql -U phonix -d phonix

# Check the audit log
docker compose exec postgres psql -U phonix -d phonix \
  -c "SELECT event_type, occurred_at, metadata FROM audit_log ORDER BY occurred_at DESC LIMIT 20;"

# Open a MinIO shell
docker compose exec minio mc ls local/audio-uploads

# Pre-warm the Whisper model manually (normally done at build time)
docker compose exec api python -c \
  "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"
```

---

## DPDP 2023 compliance

| Requirement | Implementation |
|---|---|
| **Consent (§6)** | Two-checkbox modal before any upload. Essential processing required; analytics optional. Neither pre-ticked. |
| **Purpose limitation (§4)** | Audio used only for pronunciation scoring, then deleted. |
| **Data minimisation (§8)** | faster-whisper transcribes on-device — audio never sent to a third party. Claude receives text only. |
| **Retention** | Audio deleted immediately after `AnalyzeUseCase` completes. MinIO lifecycle rule hard-deletes anything older than 1 day as a failsafe. |
| **Data residency** | All data stays on the server running Docker. You choose the country. |
| **PII in logs** | IP address and file key are SHA-256 hashed before any Postgres write. Raw values never stored. |
| **Audit trail** | Every pipeline stage writes to `audit_log`: `CONSENT_GIVEN → UPLOAD_STARTED → ANALYSIS_COMPLETE → AUDIO_DELETED`. |
| **Sub-processors** | Anthropic (text feedback only). No sub-processor for audio or storage. |
| **User notice** | Results page shows: "Your audio has been deleted from our servers." |

---

## Adding TLS to MinIO (production)

By default MinIO runs on plain HTTP inside the Docker network — nginx handles TLS externally. If you want end-to-end TLS inside Docker too:

1. Set `MINIO_SECURE=true` in `docker-compose.yml` under the `api` service environment.
2. Mount your cert into the MinIO container:
   ```yaml
   minio:
     volumes:
       - ./infra/nginx/certs/fullchain.pem:/root/.minio/certs/public.crt
       - ./infra/nginx/certs/privkey.pem:/root/.minio/certs/private.key
   ```

---

## Backing up Postgres

```bash
# Dump the audit log
docker compose exec postgres pg_dump -U phonix phonix > backup_$(date +%Y%m%d).sql

# Restore
docker compose exec -T postgres psql -U phonix phonix < backup_20240101.sql
```

---

## Scaling notes

The current `docker-compose.yml` runs everything on a single host. When you need to scale:

- **api**: stateless — run multiple replicas behind nginx `upstream` with `least_conn`.
- **minio**: switch to a 4-node MinIO cluster for erasure coding, or swap the adapter for AWS S3 (one file change: `MinioStorageAdapter` → a new `S3StorageAdapter` implementing the same `StoragePort`).
- **postgres**: promote to a managed Postgres (RDS, Neon, etc.) by changing only `POSTGRES_DSN`.
- **whisper**: pin a GPU instance for the `api` service and set `WHISPER_DEVICE=cuda`, `WHISPER_COMPUTE_TYPE=float16`.
