"""Provider layer: database (store/db.py), embeddings, LLM, transcription, storage.

Each getter returns the live implementation when its credentials are configured
and the offline one otherwise (see config.Settings.provider_status).
"""
from functools import lru_cache

from config import settings


@lru_cache(maxsize=1)
def get_embedder():
    from providers.embeddings import KeywordEmbeddings, OpenAIEmbeddings

    return OpenAIEmbeddings() if settings.provider_status()["embeddings"] == "openai" else KeywordEmbeddings()


@lru_cache(maxsize=1)
def get_llm():
    if settings.provider_status()["llm"] == "claude":
        from providers.llm_claude import ClaudeLLM

        return ClaudeLLM()
    from providers.llm_mock import MockLLM

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
