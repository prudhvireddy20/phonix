"""
FasterWhisperAdapter — implements TranscriptionPort using faster-whisper
(CTranslate2 runtime, runs fully on-device).

DPDP advantage over OpenAI Whisper API:
  • Audio bytes NEVER leave the Railway server — no third-party data processor
    for the most privacy-sensitive asset in the pipeline.
  • Eliminates the need to list OpenAI as a sub-processor in the privacy notice.
  • Removes the OPENAI_API_KEY requirement entirely.

Model is loaded once at process startup (singleton via lru_cache in
dependencies.py) and kept in memory — no cold-start cost per request.

Environment variables:
  WHISPER_MODEL_SIZE   — tiny / base / small / medium (default: base)
                         "base" is ~145MB, transcribes 35s audio in ~2s on CPU.
                         Use "small" for better accuracy if Railway has ≥1GB RAM.
  WHISPER_DEVICE       — cpu / cuda (default: cpu — Railway free tier has no GPU)
  WHISPER_COMPUTE_TYPE — int8 / float16 / float32 (default: int8 for CPU efficiency)
  WHISPER_LANGUAGE     — force language (default: en)
  WHISPER_BEAM_SIZE    — beam search width (default: 5)

Returns: {"text": str, "words": [{"word": str, "start": float, "end": float}]}
"""
from __future__ import annotations

import asyncio
import io
import logging
import os
import tempfile

logger = logging.getLogger(__name__)

# Lazy import — faster_whisper is only available after pip install
_model_cache: "WhisperModel | None" = None  # type: ignore[name-defined]


def _load_model() -> "WhisperModel":  # type: ignore[name-defined]
    """
    Load and cache the faster-whisper model at first call.
    Subsequent calls return the cached instance immediately.
    Called inside run_in_executor so it doesn't block the event loop.
    """
    global _model_cache
    if _model_cache is not None:
        return _model_cache

    from faster_whisper import WhisperModel  # type: ignore

    model_size   = os.environ.get("WHISPER_MODEL_SIZE",   "base")
    device       = os.environ.get("WHISPER_DEVICE",       "cpu")
    compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

    logger.info(
        "Loading faster-whisper model '%s' on %s (%s) — first request only…",
        model_size, device, compute_type,
    )
    _model_cache = WhisperModel(model_size, device=device, compute_type=compute_type)
    logger.info("faster-whisper model ready.")
    return _model_cache


def _transcribe_sync(wav_bytes: bytes, language: str, beam_size: int) -> dict:
    """
    Synchronous transcription — runs in a thread pool via run_in_executor.
    faster-whisper is CPU-bound and not async-native, so we keep it off
    the event loop entirely.
    """
    model = _load_model()

    # Write to a named temp file — faster-whisper needs a file path, not bytes
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(wav_bytes)
        tmp_path = f.name

    try:
        segments, info = model.transcribe(
            tmp_path,
            language          = language,
            beam_size         = beam_size,
            word_timestamps   = True,   # essential for per-word phoneme scoring
            vad_filter        = True,   # skip silence — faster, less hallucination
            vad_parameters    = {"min_silence_duration_ms": 300},
        )

        words      : list[dict] = []
        full_text  : list[str]  = []

        for segment in segments:
            full_text.append(segment.text.strip())
            if segment.words:
                for w in segment.words:
                    word = w.word.strip()
                    if word:
                        words.append({
                            "word":  word,
                            "start": round(w.start, 3),
                            "end":   round(w.end,   3),
                        })

        transcript = " ".join(full_text).strip()

        # Fallback: if VAD filtered everything or word_timestamps were empty
        if not words and transcript:
            words = _synthesize_words(transcript)

        return {"text": transcript, "words": words}

    finally:
        import os as _os
        try:
            _os.unlink(tmp_path)
        except OSError:
            pass


def _synthesize_words(text: str) -> list[dict]:
    """
    Evenly-spaced synthetic timestamps when word_timestamps are unavailable.
    Phoneme scoring still works — we lose precise timing but keep accuracy.
    """
    tokens = text.split()
    step   = 1.0
    return [
        {"word": w, "start": round(i * step, 3), "end": round((i + 1) * step, 3)}
        for i, w in enumerate(tokens)
    ]


class FasterWhisperAdapter:
    """
    On-device speech-to-text using faster-whisper (CTranslate2).
    Audio is transcribed locally — no data leaves the Railway server.
    """

    def __init__(self):
        self.language  = os.environ.get("WHISPER_LANGUAGE",  "en")
        self.beam_size = int(os.environ.get("WHISPER_BEAM_SIZE", "5"))

    async def transcribe(
        self, audio_bytes: bytes, language: str = "en"
    ) -> dict:
        """
        Transcribe WAV bytes in a thread pool (non-blocking).
        Returns {"text": str, "words": [{word, start, end}, ...]}.
        """
        lang = language or self.language
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            _transcribe_sync,
            audio_bytes,
            lang,
            self.beam_size,
        )
