"""Ramp-up paths (SPEC §5.8, §9.8) and contributor credit (§5.9)."""
from datetime import timedelta
from typing import Dict, List

import sqlalchemy as sa

import routing
from busfactor import topic_rows
from store.db import one, rows
from store.schema import (answer_deliveries, contributions, knowledge_entries, new_id, now, people, rampup_items,
                          teams, topics)

DAYS = 14


def dependent_teams(conn, team_id: str) -> List[str]:
    """Teams this team's work depends on: co-owners of its topics and owners of topics it co-owns."""
    deps = []
    for t in rows(conn.execute(sa.select(topics))):
        if t["team_id"] == team_id:
            deps += t["co_owner_team_ids"]
        elif team_id in t["co_owner_team_ids"]:
            deps.append(t["team_id"])
    return [d for d in dict.fromkeys(deps) if d != team_id]


def generate(conn, person: Dict, started=None) -> None:
    conn.execute(rampup_items.delete().where(rampup_items.c.person_id == person["id"]))
    created = started or now()
    order = [person["team_id"]] + dependent_teams(conn, person["team_id"])
    span = max(1, 10 // len(order))  # ten working days across the two weeks
    all_topics = topic_rows(conn)
    items = []
    for i, team_id in enumerate(order):
        first_day = 1 + i * span
        team_topics = sorted([t for t in all_topics if t["team_id"] == team_id], key=lambda t: -t["ask_count"])
        day = first_day
        for t in [t for t in team_topics if t["status"] != "red"][:4]:
            items.append(dict(day=day, team_id=team_id, kind="topic", title=t["name"],
                              detail={"topic_id": t["id"], "question": f"What should I know about {t['name'].lower()}?",
                                      "status": t["status"]}))
            day = min(first_day + span - 1, day + 1)
        seen = set()
        for t in team_topics[:4]:
            ranked = routing.ranked_experts(conn, team_id, t["id"])
            if ranked and ranked[0]["id"] != person["id"] and ranked[0]["id"] not in seen:
                p = ranked[0]
                seen.add(p["id"])
                items.append(dict(day=first_day + min(1, span - 1), team_id=team_id, kind="person", title=p["name"],
                                  detail={"person_id": p["id"], "why": f"Knows {t['name'].lower()}", "title": p["title"]}))
            if len(seen) >= 2:
                break
        for t in [t for t in team_topics if t["status"] == "red"]:
            only = t["knowers"][0]["name"] if t["knowers"] else None
            items.append(dict(day=first_day + span - 1, team_id=team_id, kind="gap", title=t["name"],
                              detail={"topic_id": t["id"], "why": f"Undocumented; only {only} knows it" if only else
                                      "Undocumented"}))
    for it in items:
        conn.execute(rampup_items.insert().values(id=new_id(), person_id=person["id"], created_at=created, **it))


def path(conn, person: Dict) -> Dict:
    items = rows(conn.execute(sa.select(rampup_items).where(rampup_items.c.person_id == person["id"])
                              .order_by(rampup_items.c.day, rampup_items.c.kind)))
    if not items:
        generate(conn, person)
        return path(conn, person)
    started = min(i["created_at"] for i in items)
    team_names = dict(conn.execute(sa.select(teams.c.id, teams.c.name)).all())
    day = min(DAYS, (now() - started).days + 1)
    return {
        "person_id": person["id"], "day": day, "days": DAYS,
        "teams": [{"team_id": t, "name": team_names[t]} for t in dict.fromkeys(i["team_id"] for i in items)],
        "items": [{**{k: i[k] for k in ("id", "day", "team_id", "kind", "title", "detail", "done")}} for i in items],
        "progress": {"done": sum(1 for i in items if i["done"]), "total": len(items)},
    }


def toggle(conn, item_id: str, person: Dict) -> Dict:
    item = one(conn.execute(sa.select(rampup_items).where(rampup_items.c.id == item_id)))
    if not item or item["person_id"] != person["id"]:
        raise KeyError(item_id)
    conn.execute(rampup_items.update().where(rampup_items.c.id == item_id).values(done=not item["done"]))
    return {**item, "done": not item["done"]}


def impact(conn, person_id: str) -> Dict:
    """'Your answers have helped 23 people across 3 teams.'"""
    entry_ids = conn.execute(sa.select(contributions.c.entry_id).where(contributions.c.person_id == person_id)).scalars().all()
    reached = rows(conn.execute(
        sa.select(answer_deliveries.c.person_id, people.c.team_id)
        .select_from(answer_deliveries.join(people, answer_deliveries.c.person_id == people.c.id))
        .where(answer_deliveries.c.entry_id.in_(entry_ids), answer_deliveries.c.person_id != person_id)
    )) if entry_ids else []
    entries = rows(conn.execute(sa.select(knowledge_entries.c.id, knowledge_entries.c.question,
                                          knowledge_entries.c.status).where(knowledge_entries.c.id.in_(entry_ids)))) \
        if entry_ids else []
    helped = {r["person_id"] for r in reached}
    per_entry = dict(conn.execute(sa.select(contributions.c.entry_id, contributions.c.helped_count).where(
        contributions.c.person_id == person_id)).all())
    return {
        "person_id": person_id, "entries": len(entry_ids), "people_helped": len(helped),
        "teams_reached": len({r["team_id"] for r in reached}),
        "answers": sorted([{**e, "helped": per_entry.get(e["id"], 0)} for e in entries], key=lambda e: -e["helped"]),
    }
