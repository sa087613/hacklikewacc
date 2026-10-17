"""Citation verification (SPEC §6): every quote must exist verbatim in its source.

Runs on every model output, live or mock. A citation is dropped when its quote is
not found in the cited source's text, or when the source was not part of the
evidence the asker is allowed to see (so withheld sources can never be cited).
"""
from typing import Dict, Iterable, List, Tuple

import sqlalchemy as sa

from store.db import rows
from store.schema import sources
from text import normalize_quote

MIN_QUOTE_CHARS = 8


def locate(quote: str, text: str) -> Tuple[int, int]:
    """Return (start, end) of quote in text, or (-1, -1). Exact first, then whitespace-normalized."""
    if not quote:
        return -1, -1
    i = text.find(quote)
    if i >= 0:
        return i, i + len(quote)
    nq = normalize_quote(quote)
    if len(nq) < MIN_QUOTE_CHARS:
        return -1, -1
    # Map normalized text back to original offsets.
    norm_chars, index_map = [], []
    prev_space = True
    for idx, ch in enumerate(text):
        c = normalize_quote(ch) if ch not in " \t\n\r" else " "
        if c == " ":
            if prev_space:
                continue
            prev_space = True
        else:
            prev_space = False
        norm_chars.append(c or " ")
        index_map.append(idx)
    norm = "".join(norm_chars)
    j = norm.find(nq)
    if j < 0:
        return -1, -1
    return index_map[j], index_map[j + len(nq) - 1] + 1


def load_texts(conn: sa.Connection, source_ids: Iterable[str]) -> Dict[str, Dict]:
    ids = list(set(source_ids))
    if not ids:
        return {}
    return {
        r["id"]: r
        for r in rows(conn.execute(sa.select(sources.c.id, sources.c.text, sources.c.title, sources.c.team_id,
                                            sources.c.type).where(sources.c.id.in_(ids))))
    }


def verify_citations(
    conn: sa.Connection, citations: List[Dict], allowed_source_ids: Iterable[str]
) -> Tuple[List[Dict], List[Dict]]:
    """Return (verified, dropped). Verified citations gain offsets, title, and team."""
    allowed = set(allowed_source_ids)
    texts = load_texts(conn, [c.get("source_id") for c in citations if c.get("source_id") in allowed])
    verified, dropped = [], []
    for c in citations:
        sid, quote = c.get("source_id"), (c.get("quote") or "").strip()
        if sid not in allowed:
            dropped.append({**c, "reason": "source not in permitted evidence"})
            continue
        if len(quote) < MIN_QUOTE_CHARS:
            dropped.append({**c, "reason": "quote too short"})
            continue
        src = texts.get(sid)
        start, end = locate(quote, src["text"]) if src else (-1, -1)
        if start < 0:
            dropped.append({**c, "reason": "quote not found in source"})
            continue
        verified.append(
            {
                "source_id": sid, "quote": src["text"][start:end], "start": start, "end": end,
                "title": src["title"], "team": src["team_id"], "source_type": src["type"],
            }
        )
    return verified, dropped


def verify_points(conn: sa.Connection, points: List[Dict], allowed_source_ids: Iterable[str]):
    """Verify every point's citations. Points that claimed sources but lose all of them are removed.

    Returns (kept_points, report) where report lists dropped citations and points.
    """
    allowed = list(allowed_source_ids)
    kept, report = [], {"dropped_citations": [], "dropped_points": []}
    for p in points:
        cits = p.get("citations") or []
        verified, dropped = verify_citations(conn, cits, allowed)
        report["dropped_citations"].extend(dropped)
        if p.get("certainty") == "no_documented_answer":
            kept.append({**p, "citations": []})
            continue
        if not verified:
            report["dropped_points"].append({"text": p.get("text"), "reason": "no verifiable citation"})
            continue
        kept.append({**p, "citations": verified})
    return kept, report
