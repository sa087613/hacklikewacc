import asyncio
import json

import sqlalchemy as sa
from fastapi import APIRouter, Request

import events
from routes.ask import sse
from store.db import rows, tx
from store.schema import agent_calls, sources

router = APIRouter()


@router.get("/network/calls")
def calls(limit: int = 100):
    """Audit log of agent-to-agent calls."""
    with tx() as conn:
        out = rows(conn.execute(sa.select(agent_calls).order_by(agent_calls.c.created_at.desc()).limit(limit)))
        ids = {s for c in out for s in c["shared_source_ids"]}
        titles = dict(conn.execute(sa.select(sources.c.id, sources.c.title).where(sources.c.id.in_(ids))).all()) if ids else {}
    for c in out:
        c["shared_sources"] = [{"source_id": s, "title": titles.get(s)} for s in c["shared_source_ids"]]
        c["created_at"] = c["created_at"].isoformat()
    return out


@router.get("/network/stream")
async def stream(request: Request):
    """SSE: edge_start / edge_end as agents call each other."""
    q = events.subscribe()

    async def gen():
        try:
            yield "data: {\"type\": \"hello\"}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    e = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"data: {json.dumps(e, default=str)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            events.unsubscribe(q)

    return sse(gen())
