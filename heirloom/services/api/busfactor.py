"""Bus factor map (SPEC §5.6, §9.5). Leads only; framed as organizational risk."""
from datetime import timedelta
from typing import Dict, List, Optional

import sqlalchemy as sa

import policy
from knowledge import entry_view
from store.db import one, rows
from store.schema import (ask_events, inbox_items, knowledge_entries, now, people, source_topics, sources,
                          topic_knowers, topics)


def topic_rows(conn, team_id: Optional[str] = None) -> List[Dict]:
    t = now()
    q = sa.select(topics).order_by(topics.c.team_id, topics.c.name)
    if team_id:
        q = q.where(topics.c.team_id == team_id)
    names = {p["id"]: p for p in rows(conn.execute(sa.select(people)))}
    out = []
    for tp in rows(conn.execute(q)):
        knowers = rows(conn.execute(sa.select(topic_knowers).where(topic_knowers.c.topic_id == tp["id"])))
        person_ids = sorted({k["person_id"] for k in knowers})
        entries = rows(conn.execute(sa.select(knowledge_entries).where(
            knowledge_entries.c.topic_id == tp["id"],
            knowledge_entries.c.status.in_(["approved", "expired", "conflicted"]))))
        doc_count = conn.execute(sa.select(sa.func.count()).select_from(
            source_topics.join(sources, source_topics.c.source_id == sources.c.id)).where(
            source_topics.c.topic_id == tp["id"], sources.c.type == "doc")).scalar()
        documented = bool(entries) or doc_count > 0
        asks = conn.execute(sa.select(sa.func.count()).select_from(ask_events).where(
            ask_events.c.topic_id == tp["id"])).scalar()
        asks += conn.execute(sa.select(sa.func.count()).select_from(inbox_items).where(
            inbox_items.c.topic_id == tp["id"])).scalar()
        overflow = conn.execute(sa.select(sa.func.count()).select_from(inbox_items).where(
            inbox_items.c.topic_id == tp["id"], inbox_items.c.overflow_from.isnot(None),
            inbox_items.c.created_at >= t - timedelta(days=30))).scalar()
        verified = [e["verified_at"] for e in entries if e["verified_at"]]
        expiring = [e for e in entries if e["expires_at"] and (e["status"] == "expired" or e["expires_at"] <= t + timedelta(days=30))]
        bus = len(person_ids)
        status = policy.topic_status(bus, documented)
        if overflow and status == "green":  # repeated overload raises the topic's risk (§6)
            status = "amber"
        out.append({
            "id": tp["id"], "name": tp["name"], "team_id": tp["team_id"], "co_owner_team_ids": tp["co_owner_team_ids"],
            "bus_factor": bus, "documented": documented, "status": status, "ask_count": asks,
            "overloaded": bool(overflow), "entry_count": len(entries), "doc_count": doc_count,
            "last_verified": max(verified).isoformat() if verified else None,
            "expiring_soon": bool(expiring),
            "knowers": [{"person_id": p, "name": names[p]["name"], "title": names[p]["title"],
                         "departing": names[p]["is_departing"],
                         "roles": sorted({k["role"] for k in knowers if k["person_id"] == p})} for p in person_ids],
        })
    return out


def knowledge_map(conn, team_id: Optional[str] = None) -> Dict:
    items = topic_rows(conn, team_id)
    stats = {s: sum(1 for i in items if i["status"] == s) for s in ("red", "amber", "green")}
    stats["expiring"] = sum(1 for i in items if i["expiring_soon"])
    return {"topics": items, "stats": stats}


def topic_detail(conn, topic_id: str) -> Optional[Dict]:
    base = next((t for t in topic_rows(conn) if t["id"] == topic_id), None)
    if not base:
        return None
    entries = rows(conn.execute(sa.select(knowledge_entries).where(
        knowledge_entries.c.topic_id == topic_id, knowledge_entries.c.status != "draft")))
    srcs = rows(conn.execute(sa.select(sources.c.id, sources.c.title, sources.c.type, sources.c.share_level).select_from(
        source_topics.join(sources, source_topics.c.source_id == sources.c.id)).where(source_topics.c.topic_id == topic_id)))
    open_q = rows(conn.execute(sa.select(inbox_items.c.id, inbox_items.c.question, inbox_items.c.status).where(
        inbox_items.c.topic_id == topic_id, inbox_items.c.status != "answered", inbox_items.c.merged_into_id.is_(None))))
    return {**base, "entries": [entry_view(conn, e) for e in entries], "sources": srcs, "open_questions": open_q}
