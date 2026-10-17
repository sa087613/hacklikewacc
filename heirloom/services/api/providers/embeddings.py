from typing import List, Optional

from config import settings


class KeywordEmbeddings:
    """Offline: no vectors. Search uses BM25 only."""

    name = "keyword"
    live = False

    def embed(self, texts: List[str]) -> List[Optional[List[float]]]:
        return [None for _ in texts]


class OpenAIEmbeddings:
    name = "openai"
    live = True

    def __init__(self):
        from openai import OpenAI

        self.client = OpenAI(api_key=settings.openai_api_key)

    def embed(self, texts: List[str]) -> List[Optional[List[float]]]:
        out: List[Optional[List[float]]] = []
        for i in range(0, len(texts), 100):
            resp = self.client.embeddings.create(model=settings.embedding_model, input=texts[i : i + 100])
            out.extend(d.embedding for d in sorted(resp.data, key=lambda d: d.index))
        return out
