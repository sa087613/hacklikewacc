"""Team-scoped retrieval: BM25 always, plus vectors when live embeddings exist.

Share policy is applied here, before anything reaches an LLM: hits the asker
may not see are returned only as withheld items (title label + contact), never text.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import sqlalchemy as sa

import policy
from providers import get_embedder
from store.db import backend, rows
from store.schema import chunks, sources
from text import BM25, tokens

_cache: Dict[str, Tuple[tuple, list, BM25]] = {}


@dataclass
class Hit:
    chunk_id: str
    source_id: str
    team_id: str
    title: str
    source_type: str
    share_level: str
    text: str
    start_offset: int
    score: float


@dataclass
class SearchResult:
    allowed: List[Hit] = field(default_factory=list)
    withheld: List[Dict] = field(default_factory=list)


def _corpus(conn: sa.Connection, team_id: str):
    key = tuple(
        conn.execute(
            sa.select(sa.func.count(chunks.c.id), sa.func.max(sources.c.created_at))
            .select_from(chunks.join(sources, chunks.c.source_id == sources.c.id))
            .where(chunks.c.team_id == team_id)
        ).one()
    )
    cached = _cache.get(team_id)
    if cached and cached[0] == key:
        return cached[1], cached[2]
    docs = rows(
        conn.execute(
            sa.select(
                chunks.c.id, chunks.c.source_id, chunks.c.text, chunks.c.start_offset,
                sources.c.title, sources.c.type, sources.c.share_level, sources.c.label, sources.c.team_id,
            )
            .select_from(chunks.join(sources, chunks.c.source_id == sources.c.id))
            .where(chunks.c.team_id == team_id)
            .order_by(chunks.c.id)
        )
    )
    bm = BM25([tokens(f"{d['title']} {d['text']}") for d in docs])
    _cache[team_id] = (key, docs, bm)
    return docs, bm


def _vector_scores(conn: sa.Connection, team_id: str, query: str) -> Dict[str, float]:
    embedder = get_embedder()
    if not embedder.live:
        return {}
    qv = embedder.embed([query])[0]
    if qv is None:
        return {}
    if backend() == "postgres":
        dist = chunks.c.embedding.cosine_distance(qv)
        res = conn.execute(
            sa.select(chunks.c.id, dist.label("d"))
            .where(chunks.c.team_id == team_id, chunks.c.embedding.isnot(None))
            .order_by(dist)
            .limit(20)
        )
        return {r.id: 1 - r.d for r in res}
    import math

    out = {}
    for r in conn.execute(sa.select(chunks.c.id, chunks.c.embedding).where(chunks.c.team_id == team_id)):
        if r.embedding:
            dot = sum(a * b for a, b in zip(qv, r.embedding))
            na = math.sqrt(sum(a * a for a in qv)) or 1
            nb = math.sqrt(sum(b * b for b in r.embedding)) or 1
            out[r.id] = dot / (na * nb)
    return out


def search(
    conn: sa.Connection, team_id: str, query: str, asker_team: Optional[str], k: int = 8, contact: Optional[Dict] = None,
    min_score: float = 1.0,
) -> SearchResult:
    """min_score is the BM25 floor; impact checks pass a lower one for recall (the LLM judges relevance)."""
    docs, bm = _corpus(conn, team_id)
    if not docs:
        return SearchResult()
    q = tokens(query)
    bm_scores = bm.scores(q)
    top = max(bm_scores) if bm_scores else 0.0
    vec = _vector_scores(conn, team_id, query)

    # Reciprocal-rank fusion when vectors exist; otherwise BM25 order.
    ranked_bm = sorted(range(len(docs)), key=lambda i: -bm_scores[i])
    fused: Dict[int, float] = {}
    for rank, i in enumerate(ranked_bm):
        if bm_scores[i] > 0:
            fused[i] = fused.get(i, 0) + 1 / (60 + rank)
    if vec:
        id_to_i = {d["id"]: i for i, d in enumerate(docs)}
        for rank, (cid, _) in enumerate(sorted(vec.items(), key=lambda kv: -kv[1])):
            if cid in id_to_i:
                fused[id_to_i[cid]] = fused.get(id_to_i[cid], 0) + 1 / (60 + rank)

    threshold = max(min_score, 0.3 * top)
    result = SearchResult()
    withheld_seen = set()
    for i in sorted(fused, key=lambda i: -fused[i]):
        d = docs[i]
        relevant = bm_scores[i] >= threshold or vec.get(d["id"], 0) >= 0.45
        if not relevant:
            continue
        if not policy.visible(d["share_level"], d["team_id"], asker_team):
            if d["source_id"] not in withheld_seen:
                withheld_seen.add(d["source_id"])
                result.withheld.append(
                    {
                        "team": d["team_id"],
                        "source_id": d["source_id"],
                        "item": d["label"] or d["title"],
                        "contact": contact["name"] if contact else None,
                        "contact_id": contact["id"] if contact else None,
                    }
                )
            continue
        if len(result.allowed) < k:
            result.allowed.append(
                Hit(
                    chunk_id=d["id"], source_id=d["source_id"], team_id=d["team_id"], title=d["title"],
                    source_type=d["type"], share_level=d["share_level"], text=d["text"],
                    start_offset=d["start_offset"], score=round(bm_scores[i], 3),
                )
            )
    return result
