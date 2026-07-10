"""
Domain layer — pure Python dataclasses, no framework dependencies.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ── Enumerations ──────────────────────────────────────────────────────────────

class MistakeType(str, Enum):
    MISPRONOUNCED  = "mispronounced"
    UNCLEAR_SEGMENT= "unclear_segment"
    OMISSION       = "omission"
    INSERTION      = "insertion"


class AuditEventType(str, Enum):
    CONSENT_GIVEN     = "CONSENT_GIVEN"
    UPLOAD_STARTED    = "UPLOAD_STARTED"
    ANALYSIS_COMPLETE = "ANALYSIS_COMPLETE"
    AUDIO_DELETED     = "AUDIO_DELETED"


# ── Value objects ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ConsentRecord:
    essential_processing: bool
    analytics_consent:    bool
    ip_hash:              str   # SHA-256 of the real IP; never raw


@dataclass(frozen=True)
class PhonemeFlag:
    word:          str
    expected_ipa:  str
    actual_ipa:    str
    start_time:    float
    end_time:      float
    phoneme_score: float          # 0–1
    mistake_type:  MistakeType
    suggestion:    str


@dataclass(frozen=True)
class PronunciationResult:
    transcript:    str
    overall_score: float           # 0–100
    flags:         tuple[PhonemeFlag, ...]


@dataclass(frozen=True)
class AuditEvent:
    event_type:    AuditEventType
    file_key_hash: str             # SHA-256 of the storage key
    ip_hash:       str             # SHA-256 of the client IP
    metadata:      dict[str, Any] = field(default_factory=dict)


# ── Helpers ───────────────────────────────────────────────────────────────────

def sha256_hash(value: str) -> str:
    """One-way hash of a sensitive string. Used for IPs and file keys."""
    return hashlib.sha256(value.encode()).hexdigest()
