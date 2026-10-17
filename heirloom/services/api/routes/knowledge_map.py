from typing import Optional

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException

import busfactor
import exit_interview
from models import ExitMessage, ExitStart, ExitSubmit
from notifications import notify
from routes.deps import current_person, require_lead
from store.db import rows, tx
from store.schema import exit_interviews

router = APIRouter()


@router.get("/knowledge/map")
def knowledge_map(team: Optional[str] = None, person=Depends(current_person)):
    require_lead(person)
    with tx() as conn:
        return busfactor.knowledge_map(conn, team)


@router.get("/knowledge/topics/{topic_id}")
def topic(topic_id: str, person=Depends(current_person)):
    require_lead(person)
    with tx() as conn:
        d = busfactor.topic_detail(conn, topic_id)
    if not d:
        raise HTTPException(404, "Topic not found")
    return d


@router.post("/knowledge/topics/{topic_id}/capture")
def schedule_capture(topic_id: str, person=Depends(current_person)):
    """'Schedule a 10-minute capture session with Maria.'"""
    require_lead(person)
    with tx() as conn:
        d = busfactor.topic_detail(conn, topic_id)
        if not d or not d["knowers"]:
            raise HTTPException(404, "Nobody to capture this from yet.")
        who = d["knowers"][0]
        notify(conn, who["person_id"], "capture", f"{person['name']} scheduled a 10-minute capture session",
               f"Topic: {d['name']}", "/inbox")
    return {"scheduled_with": who["name"], "topic": d["name"]}


@router.get("/exit-interviews")
def list_interviews(person=Depends(current_person)):
    with tx() as conn:
        out = rows(conn.execute(sa.select(exit_interviews).order_by(exit_interviews.c.created_at.desc())))
        return [exit_interview.view(conn, r) for r in out
                if r["person_id"] == person["id"] or r["started_by"] == person["id"]]


@router.post("/exit-interviews")
def start(body: ExitStart, person=Depends(current_person)):
    return exit_interview.start(person, body.person_id, body.consent)


@router.get("/exit-interviews/{interview_id}")
def get(interview_id: str, person=Depends(current_person)):
    with tx() as conn:
        v = exit_interview.view(conn, exit_interview._get(conn, interview_id))
    if person["id"] not in (v["person"]["id"], v["started_by"]["id"]):
        raise HTTPException(403, "Exit interviews are visible to the person and their lead only.")
    return v


@router.post("/exit-interviews/{interview_id}/message")
def message(interview_id: str, body: ExitMessage, person=Depends(current_person)):
    text = body.transcript if body.kind == "voice" and body.transcript else body.text
    if not text or not text.strip():
        raise HTTPException(400, "Send an answer or a voice-note transcript.")
    return exit_interview.message(interview_id, person, text, body.kind, body.duration_s)


@router.post("/exit-interviews/{interview_id}/skip")
def skip(interview_id: str, person=Depends(current_person)):
    return exit_interview.skip(interview_id, person)


@router.post("/exit-interviews/{interview_id}/submit")
def submit(interview_id: str, body: ExitSubmit, person=Depends(current_person)):
    return exit_interview.submit(interview_id, person, body.drafts)
