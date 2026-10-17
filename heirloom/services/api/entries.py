"""Lookups linking sources to the knowledge entries they back."""
from typing import Dict, Iterable, List

import sqlalchemy as sa

from citations import locate
from store.db import rows
from store.schema import entry_sources, knowledge_entries, people, sources

LIVE_STATUSES = ("approved", "expired", "conflicted")


def entries_for_sources(conn: sa.Connection, source_ids: Iterable[str]) -> Dict[str, List[Dict]]:
    """source_id -> entries backed by it, each with the quote span it is backed by (None = whole source)."""
    ids = list(set(source_ids))
    if not ids:
        return {}
    verifier = people.alias("verifier")
    base = sa.select(knowledge_entries, verifier.c.name.label("verified_by_name")).select_from(
        knowledge_entries.outerjoin(verifier, knowledge_entries.c.verified_by == verifier.c.id)
    ).where(knowledge_entries.c.status.in_(LIVE_STATUSES))
    out: Dict[str, List[Dict]] = {}
    for e in rows(conn.execute(base.where(knowledge_entries.c.source_id.in_(ids)))):
        out.setdefault(e["source_id"], []).append({**e, "span": None})
    linked = rows(conn.execute(
        sa.select(entry_sources.c.entry_id, entry_sources.c.source_id, entry_sources.c.quote, sources.c.text)
        .select_from(entry_sources.join(sources, entry_sources.c.source_id == sources.c.id))
        .where(entry_sources.c.source_id.in_(ids))
    ))
    if linked:
        by_id = {e["id"]: e for e in rows(conn.execute(base.where(
            knowledge_entries.c.id.in_([l["entry_id"] for l in linked]))))}
        for l in linked:
            e = by_id.get(l["entry_id"])
            if e and e.get("source_id") != l["source_id"]:
                out.setdefault(l["source_id"], []).append({**e, "span": locate(l["quote"], l["text"])})
    return out


def entry_for_citation(index: Dict[str, List[Dict]], citation: Dict):
    """The entry a verified citation falls under, if any."""
    for e in index.get(citation["source_id"], []):
        span = e["span"]
        if span is None:
            return e
        if span[0] >= 0 and citation["start"] < span[1] and citation["end"] > span[0]:
            return e
    return None
