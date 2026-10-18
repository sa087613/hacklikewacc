"""Provider layer: database (store/db.py), embeddings, LLM, transcription, storage.

Each getter returns the live implementation when its credentials are configured
and the offline one otherwise (see config.Settings.provider_status).
"""
import logging
from functools import lru_cache

from config import settings


@lru_cache(maxsize=1)
def get_embedder():
    from providers.embeddings import KeywordEmbeddings, OpenAIEmbeddings

    return OpenAIEmbeddings() if settings.provider_status()["embeddings"] == "openai" else KeywordEmbeddings()


last_llm_error = ""  # most recent live-LLM failure, reported by /health


class _WithFallback:
    """Live LLM first; if a call fails, log it, remember it for /health, and answer with the offline mock."""

    name = "claude"
    live = True

    def __init__(self, live, fallback):
        self._live, self._fallback = live, fallback

    def __getattr__(self, method):
        def call(*args, **kwargs):
            global last_llm_error
            try:
                result = getattr(self._live, method)(*args, **kwargs)
                last_llm_error = ""
                return result
            except Exception as e:
                last_llm_error = f"{method}: {type(e).__name__}: {e}"[:500]
                logging.getLogger("heirloom").exception("Claude call failed; using the offline answerer")
                return getattr(self._fallback, method)(*args, **kwargs)

        return call


@lru_cache(maxsize=1)
def get_llm():
    from providers.llm_mock import MockLLM

    if settings.provider_status()["llm"] == "claude":
        from providers.llm_claude import ClaudeLLM

        return _WithFallback(ClaudeLLM(), MockLLM())
    return MockLLM()


@lru_cache(maxsize=1)
def get_transcriber():
    from providers.transcribe import TranscriptOnly, WhisperTranscriber

    return WhisperTranscriber() if settings.provider_status()["transcription"] == "whisper" else TranscriptOnly()


@lru_cache(maxsize=1)
def get_storage():
    from providers.storage import LocalStorage, MemoryStorage, SupabaseStorage

    kind = settings.provider_status()["storage"]
    return SupabaseStorage() if kind == "supabase" else MemoryStorage() if kind == "memory" else LocalStorage()


def reset() -> None:
    for f in (get_embedder, get_llm, get_transcriber, get_storage):
        f.cache_clear()
