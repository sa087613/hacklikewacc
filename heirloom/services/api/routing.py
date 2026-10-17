"""Routing questions to human experts (SPEC §6 "Routing to humans").

- Pick the expert who authored, answered, or was cited most on the topic; fall back to the team lead.
- Cap open questions per person; skip capped experts and record the overflow (raises topic risk).
- Merge semantically similar open questions so the expert answers once.
- Escalate to the team lead after the timeout (24h, or 2 minutes in demo mode).
"""
from typing import Dict, List, Optional

import sqlalchemy as sa

import policy
from config import settings
from notifications import notify
from providers import get_embedder
from store.db import one, rows
from store.schema import inbox_items, new_id, now, people, source_topics, sources, topic_knowers, topics
from text import similarity, tokens

ROLE_RANK = {"expert": 0, "lead": 1, "member": 2}


def open_count(conn: sa.Connection, person_id: str) -> int:
    return conn.execute(
        sa.select(sa.func.count()).select_from(inbox_items).where(
            inbox_items.c.status.in_(["pending", "escalated"]),
            inbox_items.c.merged_into_id.is_(None),
            sa.or_(inbox_items.c.expert_id == person_id, inbox_items.c.escalated_to == person_id),
        )
    ).scalar()


def ranked_experts(conn: sa.Connection, team_id: str, topic_id: Optional[str]) -> List[Dict]:
    """People who know the topic, most involvement first; then the team lead."""
    ranked: List[Dict] = []
    if topic_id:
        counts = rows(conn.execute(
            sa.select(people, sa.func.count().label("n"))
            .select_from(topic_knowers.join(people, topic_knowers.c.person_id == people.c.id))
            .where(topic_knowers.c.topic_id == topic_id)
            .group_by(*people.c)
        ))
        ranked = sorted(counts, key=lambda p: (-p["n"], ROLE_RANK.get(p["role"], 3), p["name"]))
    lead = policy.team_lead(conn, team_id)
    if lead and all(p["id"] != lead["id"] for p in ranked):
        ranked.append(lead)
    return ranked


def best_topic(conn: sa.Connection, team_id: str, question: str) -> Optional[str]:
    """The team topic whose name and source titles best match the question."""
    q = set(tokens(question))
    best, best_score = None, 0.0
    for t in rows(conn.execute(sa.select(topics).where(topics.c.team_id == team_id))):
        titles = conn.execute(
            sa.select(sources.c.title).select_from(source_topics.join(sources, source_topics.c.source_id == sources.c.id))
            .where(source_topics.c.topic_id == t["id"])
        ).scalars().all()
        name_score = len(q & set(tokens(t["name"] + " " + t["id"].replace("-", " "))))
        title_score = len(q & set(tokens(" ".join(titles)))) * 0.25
        score = name_score + title_score
        if score > best_score:
            best, best_score = t["id"], score
    return best


def _similar(a: str, b: str) -> bool:
    if similarity(a, b) >= settings.dedupe_similarity:
        return True
    emb = get_embedder()
    if emb.live:
        va, vb = emb.embed([a, b])
        if va and vb:
            dot = sum(x * y for x, y in zip(va, vb))
            return dot >= 0.88  # OpenAI embeddings are unit-normalized
    return False


def find_duplicate(conn: sa.Connection, team_id: str, question: str) -> Optional[Dict]:
    open_items = rows(conn.execute(
        sa.select(inbox_items).where(
            inbox_items.c.team_id == team_id,
            inbox_items.c.status.in_(["pending", "escalated"]),
            inbox_items.c.merged_into_id.is_(None),
        )
    ))
    for item in open_items:
        if _similar(item["question"], question):
            return item
    return None


def route_question(
    conn: sa.Connection, *, question: str, team_id: str, asker_person_id: Optional[str],
    via_team_id: Optional[str], topic_id: Optional[str] = None,
) -> Dict:
    """Create (or merge into) an inbox item. Returns the item the asker is waiting on."""
    topic_id = topic_id or best_topic(conn, team_id, question)
    dup = find_duplicate(conn, team_id, question)
    if dup:
        conn.execute(inbox_items.insert().values(
            id=new_id(), question=question, asker_person_id=asker_person_id, via_team_id=via_team_id,
            team_id=team_id, expert_id=dup["expert_id"], topic_id=dup["topic_id"] or topic_id,
            status=dup["status"], merged_into_id=dup["id"],
        ))
        return {**dup, "merged": True}

    candidates = ranked_experts(conn, team_id, topic_id)
    expert, overflow_from = None, None
    for c in candidates:
        if open_count(conn, c["id"]) < settings.expert_open_cap:
            expert = c
            break
        overflow_from = overflow_from or c["id"]
    if expert is None:  # everyone is at the cap: the team lead still gets it
        expert = policy.team_lead(conn, team_id)
    item_id = new_id()
    conn.execute(inbox_items.insert().values(
        id=item_id, question=question, asker_person_id=asker_person_id, via_team_id=via_team_id,
        team_id=team_id, expert_id=expert["id"] if expert else None, topic_id=topic_id,
        status="pending", overflow_from=overflow_from,
    ))
    if expert:
        notify(conn, expert["id"], "question", "New question for you", question, "/inbox")
    return one(conn.execute(sa.select(inbox_items).where(inbox_items.c.id == item_id))) | {"merged": False}


def escalate_overdue(conn: sa.Connection) -> int:
    """Escalate pending items older than the timeout to the team lead. Returns how many."""
    n = 0
    t = now()
    for item in rows(conn.execute(sa.select(inbox_items).where(
        inbox_items.c.status == "pending", inbox_items.c.merged_into_id.is_(None)
    ))):
        if not policy.overdue(item["created_at"], t, settings.timeout_minutes):
            continue
        lead = policy.team_lead(conn, item["team_id"])
        if lead is None or lead["id"] == item["expert_id"]:
            # The expert is the lead: nobody further up; mark escalated so the asker sees it.
            lead_id = item["expert_id"]
        else:
            lead_id = lead["id"]
        conn.execute(inbox_items.update().where(
            sa.or_(inbox_items.c.id == item["id"], inbox_items.c.merged_into_id == item["id"])
        ).values(status="escalated", escalated_to=lead_id, escalated_at=t))
        notify(conn, lead_id, "escalation", "Escalated question", item["question"], "/inbox")
        n += 1
    return n


def item_view(conn: sa.Connection, item: Dict) -> Dict:
    """Asker-facing pending state: 'Pending · asked Maria Lopez 3h ago'."""
    expert = one(conn.execute(sa.select(people).where(people.c.id == item["expert_id"]))) if item.get("expert_id") else None
    esc = one(conn.execute(sa.select(people).where(people.c.id == item["escalated_to"]))) if item.get("escalated_to") else None
    return {
        "inbox_item_id": item["merged_into_id"] or item["id"],
        "person": expert["name"] if expert else None,
        "person_id": expert["id"] if expert else None,
        "team": item["team_id"],
        "status": item["status"],
        "asked_at": item["created_at"].isoformat(),
        "escalated_to": esc["name"] if esc else None,
        "merged": bool(item.get("merged") or item.get("merged_into_id")),
    }
