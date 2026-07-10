"""
Phoneme scoring engine.

Pipeline per word:
  1. Convert reference word → IPA  (via phonemizer or CMU fallback dict)
  2. Convert transcribed word → IPA
  3. Compute normalised Levenshtein distance on IPA character sequences
  4. Produce a 0–1 phoneme_score and classify the mistake type

Falls back gracefully when phonemizer is unavailable (e.g. espeak not installed
in the deployment container) by using a lightweight CMU-derived approximation.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Optional

import Levenshtein

from app.domain.models import MistakeType, PhonemeFlag

# ── CMU-inspired mini-dictionary for common English words ───────────────────
# Only used when phonemizer/espeak is unavailable.
_FALLBACK_IPA: dict[str, str] = {
    "the": "ðə", "a": "ə", "an": "æn", "is": "ɪz", "are": "ɑːr",
    "was": "wɒz", "were": "wɜːr", "be": "biː", "been": "biːn",
    "have": "hæv", "has": "hæz", "had": "hæd", "do": "duː", "does": "dʌz",
    "did": "dɪd", "will": "wɪl", "would": "wʊd", "shall": "ʃæl",
    "should": "ʃʊd", "may": "meɪ", "might": "maɪt", "can": "kæn",
    "could": "kʊd", "not": "nɒt", "and": "ænd", "or": "ɔːr",
    "but": "bʌt", "if": "ɪf", "in": "ɪn", "on": "ɒn", "at": "æt",
    "to": "tuː", "of": "ɒv", "for": "fɔːr", "with": "wɪð",
    "this": "ðɪs", "that": "ðæt", "it": "ɪt", "he": "hiː", "she": "ʃiː",
    "we": "wiː", "they": "ðeɪ", "i": "aɪ", "you": "juː",
    "hello": "həˈloʊ", "world": "wɜːrld", "english": "ˈɪŋɡlɪʃ",
    "pronunciation": "prəˌnʌnsiˈeɪʃən", "please": "pliːz",
    "thank": "θæŋk", "thanks": "θæŋks", "sorry": "ˈsɒri",
    "yes": "jɛs", "no": "noʊ", "good": "ɡʊd", "bad": "bæd",
    "very": "ˈvɛri", "well": "wɛl", "how": "haʊ", "what": "wɒt",
    "when": "wɛn", "where": "wɛr", "why": "waɪ", "who": "huː",
    "which": "wɪtʃ", "my": "maɪ", "your": "jɔːr", "his": "hɪz",
    "her": "hɜːr", "our": "aʊər", "their": "ðɛr",
}


def _phonemize(word: str) -> str:
    """
    Convert a word to an IPA string.
    Tries phonemizer first; falls back to lookup table; falls back to word itself.
    """
    clean = re.sub(r"[^a-z']", "", word.lower())

    # 1. Try phonemizer (requires espeak-ng on the system)
    try:
        from phonemizer import phonemize  # type: ignore
        from phonemizer.backend import EspeakBackend  # type: ignore

        result = phonemize(
            clean,
            backend="espeak",
            language="en-us",
            with_stress=True,
            njobs=1,
        )
        ipa = result.strip()
        if ipa:
            return ipa
    except Exception:
        pass

    # 2. Lookup table
    if clean in _FALLBACK_IPA:
        return _FALLBACK_IPA[clean]

    # 3. Last resort: return the word itself (Levenshtein will compare strings)
    return clean


def _normalise_ipa(ipa: str) -> str:
    """Strip stress marks and diacritics for a lenient comparison."""
    # Remove primary/secondary stress markers
    ipa = ipa.replace("ˈ", "").replace("ˌ", "").replace("ː", "")
    # Decompose and strip combining marks
    nfd = unicodedata.normalize("NFD", ipa)
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn")


def phoneme_score(ref_word: str, actual_word: str, strict: bool = False) -> tuple[float, str, str]:
    """
    Returns (score 0–1, ref_ipa, actual_ipa).
    1.0 = perfect, 0.0 = completely different.
    """
    ref_ipa    = _phonemize(ref_word)
    actual_ipa = _phonemize(actual_word)

    compare_ref    = ref_ipa    if strict else _normalise_ipa(ref_ipa)
    compare_actual = actual_ipa if strict else _normalise_ipa(actual_ipa)

    if not compare_ref:
        return 1.0, ref_ipa, actual_ipa

    distance = Levenshtein.distance(compare_ref, compare_actual)
    max_len  = max(len(compare_ref), len(compare_actual), 1)
    score    = 1.0 - (distance / max_len)
    return max(0.0, score), ref_ipa, actual_ipa


def classify_mistake(
    ref_word: str,
    actual_word: str,
    score: float,
    ref_ipa: str,
    actual_ipa: str,
) -> MistakeType:
    """Heuristic classification of what kind of error occurred."""
    if score >= 0.85:
        return MistakeType.UNCLEAR_SEGMENT   # minor deviation
    if not actual_word.strip():
        return MistakeType.OMISSION
    # Insertion: actual has many extra phonemes
    if len(_normalise_ipa(actual_ipa)) > len(_normalise_ipa(ref_ipa)) * 1.5:
        return MistakeType.INSERTION
    return MistakeType.MISPRONOUNCED


def build_suggestion(ref_word: str, ref_ipa: str, score: float) -> str:
    if score >= 0.85:
        return f"Almost right — listen for subtle differences in '{ref_word}' ({ref_ipa})."
    return f"Try pronouncing '{ref_word}' as /{ref_ipa}/."


def align_and_score(
    reference_words: list[str],
    whisper_words: list[dict],  # [{"word": str, "start": float, "end": float}]
    score_threshold: float = 0.75,
) -> tuple[list[PhonemeFlag], float]:
    """
    Align reference tokens to Whisper tokens (simple greedy left-to-right),
    compute per-word phoneme scores, return (flags, overall_score).
    """
    flags: list[PhonemeFlag] = []
    scores: list[float] = []

    # Build flat whisper word list for alignment
    whisper_flat = [w for w in whisper_words if w.get("word", "").strip()]

    ref_clean = [re.sub(r"[^a-zA-Z']+", "", w) for w in reference_words]
    ref_clean  = [w for w in ref_clean if w]

    # Simple greedy alignment — pair by index (works well when STT is good)
    for i, ref_word in enumerate(ref_clean):
        if i < len(whisper_flat):
            actual = whisper_flat[i]
            actual_word = re.sub(r"[^a-zA-Z']+", "", actual["word"])
            start = actual.get("start", 0.0)
            end   = actual.get("end",   0.0)
        else:
            # Word was skipped/omitted by speaker
            actual_word = ""
            start = end = 0.0

        score, ref_ipa, actual_ipa = phoneme_score(ref_word, actual_word)
        scores.append(score)

        if score < score_threshold:
            mistake = classify_mistake(ref_word, actual_word, score, ref_ipa, actual_ipa)
            hint    = build_suggestion(ref_word, ref_ipa, score)
            flags.append(
                PhonemeFlag(
                    word         = ref_word,
                    expected_ipa = ref_ipa,
                    actual_ipa   = actual_ipa,
                    start_time   = start,
                    end_time     = end,
                    phoneme_score= round(score, 4),
                    mistake_type = mistake,
                    suggestion   = hint,
                )
            )

    overall = (sum(scores) / len(scores) * 100) if scores else 0.0
    return flags, round(overall, 1)
