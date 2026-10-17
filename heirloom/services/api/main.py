import asyncio
import logging
from contextlib import asynccontextmanager

import sqlalchemy as sa
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import events
import knowledge
import routing
from config import settings
from routes import ask, inbox, insights, knowledge_map, network, people, sources, system
from store import db

log = logging.getLogger("heirloom")


async def _housekeeping():
    """§6 timers: escalate overdue questions; mark expired entries and ping owners."""
    while True:
        await asyncio.sleep(20)
        try:
            def work():
                with db.tx() as conn:
                    routing.escalate_overdue(conn)
                    knowledge.expiry_sweep(conn)
            await asyncio.get_running_loop().run_in_executor(None, work)
        except Exception:
            log.exception("housekeeping failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    events.bind_loop(asyncio.get_running_loop())
    # Offline first run: seed automatically so the app works with one command.
    if db.backend() == "sqlite":
        inspector = sa.inspect(db.engine())
        empty = not inspector.has_table("teams")
        if not empty:
            with db.tx() as conn:
                empty = conn.execute(sa.text("select count(*) from teams")).scalar() == 0
        if empty:
            from scripts.seed import seed

            log.warning("Empty database: seeding offline demo data")
            seed(verbose=False)
    task = asyncio.create_task(_housekeeping())
    yield
    task.cancel()


app = FastAPI(title="Heirloom API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[settings.web_origin],
                   allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+", allow_methods=["*"], allow_headers=["*"])
for r in (system, ask, network, inbox, knowledge_map, insights, people, sources):
    app.include_router(r.router)


@app.exception_handler(knowledge.PermissionDenied)
async def _forbidden(_: Request, e: Exception):
    return JSONResponse({"detail": str(e)}, status_code=403)


@app.exception_handler(knowledge.NotFound)
@app.exception_handler(KeyError)
async def _not_found(_: Request, e: Exception):
    return JSONResponse({"detail": f"Not found: {e}"}, status_code=404)


@app.exception_handler(ValueError)
async def _bad_request(_: Request, e: Exception):
    return JSONResponse({"detail": str(e)}, status_code=400)
