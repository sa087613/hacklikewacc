import asyncio
import contextvars
import json

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

import knowledge
import policy
from models import AskRequest, FlagIn
from orchestrator import answer_question
from routes.deps import current_person
from store.db import one, tx
from store.schema import answers, sources

router = APIRouter()


def sse(gen_events):
    return StreamingResponse(gen_events, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/ask")
async def ask(body: AskRequest, stream: bool = True, person=Depends(current_person)):
    """Ask a team agent. Streams status lines, then an AnswerCard (SSE). ?stream=false returns JSON."""
    if not body.question.strip():
        raise HTTPException(400, "Ask a question.")
    loop = asyncio.get_running_loop()
    if not stream:
        ctx = contextvars.copy_context()
        return await loop.run_in_executor(None, ctx.run, answer_question, person["id"], body.question, body.agent_team)

    queue: asyncio.Queue = asyncio.Queue()

    def emit(e):
        loop.call_soon_threadsafe(queue.put_nowait, e)

    def work():
        try:
            card = answer_question(person["id"], body.question, body.agent_team, emit)
            emit({"type": "card", "card": card})
        except Exception as ex:  # surfaced to the UI as an error event
            emit({"type": "error", "message": str(ex)})
        finally:
            emit(None)

    ctx = contextvars.copy_context()
    loop.run_in_executor(None, ctx.run, work)

    async def events():
        while True:
            e = await queue.get()
            if e is None:
                break
            yield f"data: {json.dumps(e, default=str)}\n\n"

    return sse(events())


@router.get("/answers/{answer_id}")
def get_answer(answer_id: str, person=Depends(current_person)):
    with tx() as conn:
        row = one(conn.execute(sa.select(answers).where(answers.c.id == answer_id)))
    if not row or row["person_id"] != person["id"]:
        raise HTTPException(404, "Answer not found")
    return {**row["card"], "trace": row["trace"]}


@router.post("/answers/{answer_id}/helpful")
def helpful(answer_id: str, person=Depends(current_person)):
    with tx() as conn:
        conn.execute(answers.update().where(answers.c.id == answer_id).values(helpful=True))
    return {"ok": True}


@router.post("/answers/{answer_id}/flag")
def flag_answer(answer_id: str, body: FlagIn, person=Depends(current_person)):
    with tx() as conn:
        return knowledge.flag(conn, person, body.reason, answer_id=answer_id)


@router.get("/sources/{source_id}")
def get_source(source_id: str, person=Depends(current_person)):
    """Full source text for the side panel. Share policy applies to people, too."""
    with tx() as conn:
        s = one(conn.execute(sa.select(sources).where(sources.c.id == source_id)))
    if not s:
        raise HTTPException(404, "Source not found")
    if not policy.visible(s["share_level"], s["team_id"], person["team_id"]):
        raise HTTPException(403, f"Withheld: {s['label'] or 'this source'} is {s['team_id']}-only.")
    return {k: s[k] for k in ("id", "team_id", "type", "title", "text", "share_level", "created_at", "storage_path")}
