import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import events
import knowledge
import routing
from config import settings
from routes import ask, inbox, insights, knowledge_map, network, people, sources, system
from store import bootstrap, db

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
    # First run seeds automatically so the app works with one command (also on an empty Postgres).
    await run_in_threadpool(bootstrap.ensure_seeded)
    task = asyncio.create_task(_housekeeping())
    yield
    task.cancel()


app = FastAPI(title="Heirloom API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.web_origin.split(",") if o.strip()],
                   allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+", allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def _bootstrap(request: Request, call_next):
    # Serverless hosts may skip the lifespan hook; seed (once) on the first request instead.
    await run_in_threadpool(bootstrap.ensure_seeded)
    return await call_next(request)
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
