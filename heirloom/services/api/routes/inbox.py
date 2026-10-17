from typing import Optional

import sqlalchemy as sa
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

import knowledge
import policy
import routing
from models import EntryFix, FlagIn, PrEdit
from providers.transcribe import TranscriptionUnavailable, resolve_transcript
from routes.deps import current_person
from store.db import one, rows, tx
from store.schema import answers, entry_flags, inbox_items, knowledge_entries, knowledge_prs, people, teams

router = APIRouter()


def _question_view(conn, item, names):
    merged = conn.execute(sa.select(sa.func.count()).select_from(inbox_items).where(
        inbox_items.c.merged_into_id == item["id"])).scalar()
    return {
        "id": item["id"], "question": item["question"], "status": item["status"],
        "asker": names.get(item["asker_person_id"]), "via_team": item["via_team_id"], "team": item["team_id"],
        "topic_id": item["topic_id"], "created_at": item["created_at"].isoformat(), "merged_count": merged,
        "escalated_to": names.get(item["escalated_to"]), "expert": names.get(item["expert_id"]),
        "expert_id": item["expert_id"],
    }


@router.get("/inbox")
def inbox(person=Depends(current_person)):
    with tx() as conn:
        routing.escalate_overdue(conn)
        names = dict(conn.execute(sa.select(people.c.id, people.c.name)).all())
        mine = rows(conn.execute(sa.select(inbox_items).where(
            sa.or_(inbox_items.c.expert_id == person["id"], inbox_items.c.escalated_to == person["id"]),
            inbox_items.c.status.in_(["pending", "escalated"]), inbox_items.c.merged_into_id.is_(None),
        ).order_by(inbox_items.c.created_at)))
        reviewer = knowledge.can_review(conn, person, person["team_id"])
        prs = rows(conn.execute(sa.select(knowledge_prs).where(
            knowledge_prs.c.status == "open",
            sa.or_(knowledge_prs.c.reviewer_id == person["id"],
                   knowledge_prs.c.team_id == person["team_id"] if reviewer else sa.false()),
        ).order_by(knowledge_prs.c.id))) if True else []
        flags = []
        if reviewer:
            for f in rows(conn.execute(sa.select(entry_flags).where(entry_flags.c.resolved_at.is_(None)))):
                if f["entry_id"]:
                    e = one(conn.execute(sa.select(knowledge_entries).where(knowledge_entries.c.id == f["entry_id"])))
                    if e and e["team_id"] == person["team_id"]:
                        flags.append({**f, "created_at": f["created_at"].isoformat(), "flagged_by": names.get(f["flagged_by"]),
                                      "entry": knowledge.entry_view(conn, e)})
                elif f["answer_id"]:
                    a = one(conn.execute(sa.select(answers).where(answers.c.id == f["answer_id"])))
                    if a and a["agent_team"] == person["team_id"]:
                        flags.append({**f, "created_at": f["created_at"].isoformat(), "flagged_by": names.get(f["flagged_by"]),
                                      "answer": {"question": a["question"], "lead": a["card"].get("lead")}})
        asked = rows(conn.execute(sa.select(inbox_items).where(inbox_items.c.asker_person_id == person["id"])
                                  .order_by(inbox_items.c.created_at.desc()).limit(20)))
        expired = rows(conn.execute(sa.select(knowledge_entries).where(
            knowledge_entries.c.status == "expired", knowledge_entries.c.team_id == person["team_id"]))) if reviewer else []
        return {
            "reconfirm": [knowledge.entry_view(conn, e) for e in expired],
            "questions": [_question_view(conn, i, names) for i in mine],
            "prs": [knowledge.pr_view(conn, p) for p in prs],
            "conflicts": knowledge.open_conflicts(conn, [person["team_id"]]) if reviewer else [],
            "flags": flags,
            "my_questions": [{**routing.item_view(conn, i), "question": i["question"],
                              "answered": i["status"] == "answered"} for i in asked],
            "is_reviewer": reviewer,
        }


@router.post("/inbox/{item_id}/answer")
async def answer(item_id: str, text: Optional[str] = Form(None), transcript: Optional[str] = Form(None),
                 duration_s: Optional[int] = Form(None), audio: Optional[UploadFile] = File(None),
                 person=Depends(current_person)):
    """Expert answer (typed, transcript, or audio upload) → knowledge PR."""
    audio_bytes = await audio.read() if audio else None
    voice = bool(audio_bytes) or bool(transcript)
    try:
        content = resolve_transcript(transcript or text, audio_bytes, audio.filename if audio else "")
    except TranscriptionUnavailable as e:
        raise HTTPException(422, str(e))
    origin = {"kind": "voice" if voice else "text", "duration_s": duration_s}
    with tx() as conn:
        return knowledge.answer_inbox_item(conn, item_id, person, content, origin)


@router.post("/prs/{pr_id}/approve")
def approve(pr_id: int, person=Depends(current_person)):
    with tx() as conn:
        return knowledge.approve_pr(conn, pr_id, person)


@router.post("/prs/{pr_id}/reject")
def reject(pr_id: int, person=Depends(current_person)):
    with tx() as conn:
        return knowledge.reject_pr(conn, pr_id, person)


@router.post("/prs/{pr_id}/edit")
def edit(pr_id: int, body: PrEdit, person=Depends(current_person)):
    with tx() as conn:
        return knowledge.edit_pr(conn, pr_id, person, body.model_dump())


@router.get("/entries/{entry_id}")
def get_entry(entry_id: str, person=Depends(current_person)):
    with tx() as conn:
        e = one(conn.execute(sa.select(knowledge_entries).where(knowledge_entries.c.id == entry_id)))
        if not e:
            raise HTTPException(404, "Entry not found")
        if not policy.visible(e["share_level"], e["team_id"], person["team_id"]):
            raise HTTPException(403, "Withheld")
        return knowledge.entry_view(conn, e)


@router.post("/entries/{entry_id}/flag")
def flag(entry_id: str, body: FlagIn, person=Depends(current_person)):
    with tx() as conn:
        return knowledge.flag(conn, person, body.reason, entry_id=entry_id)


@router.put("/entries/{entry_id}")
def fix(entry_id: str, body: EntryFix, person=Depends(current_person)):
    with tx() as conn:
        return knowledge.fix_entry(conn, entry_id, person, body.model_dump())


@router.post("/entries/{entry_id}/reconfirm")
def reconfirm(entry_id: str, person=Depends(current_person)):
    with tx() as conn:
        return knowledge.reconfirm(conn, entry_id, person)


@router.post("/entries/{entry_id}/keep")
def keep(entry_id: str, person=Depends(current_person)):
    """Resolve conflicting answers by keeping this entry; the others are superseded."""
    with tx() as conn:
        return knowledge.resolve_conflict(conn, entry_id, person)


@router.post("/flags/{flag_id}/dismiss")
def dismiss_flag(flag_id: str, person=Depends(current_person)):
    from store.schema import now

    with tx() as conn:
        conn.execute(entry_flags.update().where(entry_flags.c.id == flag_id).values(resolved_at=now()))
    return {"ok": True}
