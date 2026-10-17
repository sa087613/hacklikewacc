from typing import List

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException

import knowledge
import rampup
import routing
import standup
from models import TeamSettingsIn
from routes.deps import current_person
from store.db import one, rows, tx
from store.schema import (inbox_items, notifications, now, people, rampup_items, source_topics, sources, teams,
                          topics)

router = APIRouter()


@router.get("/teams")
def list_teams():
    with tx() as conn:
        return rows(conn.execute(sa.select(teams).order_by(teams.c.name)))


@router.get("/people")
def list_people():
    with tx() as conn:
        return rows(conn.execute(sa.select(people).order_by(people.c.team_id, people.c.name)))


@router.get("/teams/{team_id}")
def team_detail(team_id: str, person=Depends(current_person)):
    with tx() as conn:
        team = one(conn.execute(sa.select(teams).where(teams.c.id == team_id)))
        if not team:
            raise HTTPException(404, "Team not found")
        roster = rows(conn.execute(sa.select(people).where(people.c.team_id == team_id).order_by(people.c.name)))
        tps = rows(conn.execute(sa.select(topics).where(topics.c.team_id == team_id).order_by(topics.c.name)))
        visible = sa.or_(sources.c.share_level != "team", sources.c.team_id == person["team_id"])
        srcs = rows(conn.execute(sa.select(sources.c.id, sources.c.title, sources.c.type, sources.c.share_level,
                                           sources.c.created_at, sources.c.storage_path)
                                 .where(sources.c.team_id == team_id, visible).order_by(sources.c.title)))
        return {**team, "roster": roster, "topics": tps,
                "sources": [{**s, "created_at": s["created_at"].isoformat()} for s in srcs],
                "can_edit": knowledge.can_review(conn, person, team_id)}


@router.put("/teams/{team_id}/settings")
def update_settings(team_id: str, body: TeamSettingsIn, person=Depends(current_person)):
    with tx() as conn:
        if not knowledge.can_review(conn, person, team_id):
            raise HTTPException(403, "Only the team's knowledge owner can change settings.")
        values = {k: v for k, v in body.model_dump().items() if v is not None}
        if values:
            conn.execute(teams.update().where(teams.c.id == team_id).values(**values))
        return one(conn.execute(sa.select(teams).where(teams.c.id == team_id)))


@router.put("/sources/{source_id}/share-level")
def set_share_level(source_id: str, body: dict, person=Depends(current_person)):
    """Per-source override of the team's default share level."""
    level = body.get("share_level")
    if level not in ("team", "cross_team", "company"):
        raise HTTPException(400, "Invalid share level")
    with tx() as conn:
        s = one(conn.execute(sa.select(sources).where(sources.c.id == source_id)))
        if not s:
            raise HTTPException(404, "Source not found")
        if not knowledge.can_review(conn, person, s["team_id"]):
            raise HTTPException(403, "Only the team's knowledge owner can change share levels.")
        conn.execute(sources.update().where(sources.c.id == source_id).values(share_level=level))
    return {"id": source_id, "share_level": level}


@router.get("/notifications")
def list_notifications(person=Depends(current_person)):
    with tx() as conn:
        out = rows(conn.execute(sa.select(notifications).where(notifications.c.person_id == person["id"])
                                .order_by(notifications.c.created_at.desc()).limit(30)))
    return [{**n, "created_at": n["created_at"].isoformat(), "read": n["read_at"] is not None} for n in out]


@router.post("/notifications/read")
def mark_read(person=Depends(current_person)):
    with tx() as conn:
        conn.execute(notifications.update().where(notifications.c.person_id == person["id"],
                                                  notifications.c.read_at.is_(None)).values(read_at=now()))
    return {"ok": True}


@router.get("/rampup/{person_id}")
def get_rampup(person_id: str, person=Depends(current_person)):
    with tx() as conn:
        target = one(conn.execute(sa.select(people).where(people.c.id == person_id)))
        if not target:
            raise HTTPException(404, "Person not found")
        return rampup.path(conn, target)


@router.post("/rampup/{person_id}/regenerate")
def regenerate(person_id: str, person=Depends(current_person)):
    with tx() as conn:
        target = one(conn.execute(sa.select(people).where(people.c.id == person_id)))
        started = conn.execute(sa.select(sa.func.min(rampup_items.c.created_at)).where(
            rampup_items.c.person_id == person_id)).scalar()
        rampup.generate(conn, target, started)
        return rampup.path(conn, target)


@router.post("/rampup/items/{item_id}/toggle")
def toggle(item_id: str, person=Depends(current_person)):
    with tx() as conn:
        try:
            return rampup.toggle(conn, item_id, person)
        except KeyError:
            raise HTTPException(404, "Item not found")


@router.get("/people/{person_id}/impact")
def person_impact(person_id: str):
    with tx() as conn:
        return rampup.impact(conn, person_id)


@router.get("/home")
def home(person=Depends(current_person)):
    with tx() as conn:
        routing.escalate_overdue(conn)
        team = one(conn.execute(sa.select(teams).where(teams.c.id == person["team_id"])))
        asked = rows(conn.execute(sa.select(inbox_items).where(inbox_items.c.asker_person_id == person["id"])
                                  .order_by(inbox_items.c.created_at.desc()).limit(6)))
        ramp = rows(conn.execute(sa.select(rampup_items.c.created_at).where(
            rampup_items.c.person_id == person["id"]).limit(1)))
        ramp_day = None
        if ramp:
            ramp_day = min(rampup.DAYS, (now() - ramp[0]["created_at"]).days + 1)
        new_insights = [i for i in standup.list_insights(conn, person) if i["status"] == "new"]
        open_for_me = conn.execute(sa.select(sa.func.count()).select_from(inbox_items).where(
            sa.or_(inbox_items.c.expert_id == person["id"], inbox_items.c.escalated_to == person["id"]),
            inbox_items.c.status.in_(["pending", "escalated"]), inbox_items.c.merged_into_id.is_(None))).scalar()
        return {
            "person": person, "team": team, "rampup_day": ramp_day, "rampup_days": rampup.DAYS,
            "pending": [{**routing.item_view(conn, i), "question": i["question"],
                         "answered": i["status"] == "answered"} for i in asked],
            "insights": new_insights[:3], "insight_count": len(new_insights),
            "impact": rampup.impact(conn, person["id"]),
            "inbox_count": open_for_me,
        }


@router.get("/badges")
def badges(person=Depends(current_person)):
    """Side-nav counts."""
    with tx() as conn:
        routing.escalate_overdue(conn)
        q = conn.execute(sa.select(sa.func.count()).select_from(inbox_items).where(
            sa.or_(inbox_items.c.expert_id == person["id"], inbox_items.c.escalated_to == person["id"]),
            inbox_items.c.status.in_(["pending", "escalated"]), inbox_items.c.merged_into_id.is_(None))).scalar()
        from store.schema import knowledge_prs

        reviewer = knowledge.can_review(conn, person, person["team_id"])
        prs = conn.execute(sa.select(sa.func.count()).select_from(knowledge_prs).where(
            knowledge_prs.c.status == "open", knowledge_prs.c.team_id == person["team_id"])).scalar() if reviewer else 0
        conflicts = len(knowledge.open_conflicts(conn, [person["team_id"]])) if reviewer else 0
        from store.schema import entry_flags, knowledge_entries

        if reviewer:
            conflicts += conn.execute(sa.select(sa.func.count()).select_from(knowledge_entries).where(
                knowledge_entries.c.status == "expired", knowledge_entries.c.team_id == person["team_id"])).scalar()
            conflicts += conn.execute(sa.select(sa.func.count()).select_from(
                entry_flags.join(knowledge_entries, entry_flags.c.entry_id == knowledge_entries.c.id)).where(
                entry_flags.c.resolved_at.is_(None), knowledge_entries.c.team_id == person["team_id"])).scalar()
        ins = sum(1 for i in standup.list_insights(conn, person) if i["status"] == "new")
        unread = conn.execute(sa.select(sa.func.count()).select_from(notifications).where(
            notifications.c.person_id == person["id"], notifications.c.read_at.is_(None))).scalar()
    return {"inbox": q + prs + conflicts, "insights": ins, "notifications": unread}
