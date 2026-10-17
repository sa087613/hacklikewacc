from typing import List

from openai import OpenAI

from config import settings

_client = None


def embed(texts: List[str]) -> List[List[float]]:
    """Embed texts with the configured model. Order is preserved."""
    global _client
    if not texts:
        return []
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set. See heirloom/.env.example.")
    if _client is None:
        _client = OpenAI(api_key=settings.openai_api_key)
    out: List[List[float]] = []
    for i in range(0, len(texts), 100):
        resp = _client.embeddings.create(model=settings.embedding_model, input=texts[i : i + 100])
        out.extend(d.embedding for d in sorted(resp.data, key=lambda d: d.index))
    return out
