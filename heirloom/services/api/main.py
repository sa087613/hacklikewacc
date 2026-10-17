from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from db import connect
from routes import directory, sources

app = FastAPI(title="Heirloom API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(directory.router)
app.include_router(sources.router)


@app.get("/health")
def health():
    try:
        with connect(register_vectors=False) as conn:
            counts = conn.execute(
                """select (select count(*) from teams) as teams,
                          (select count(*) from people) as people,
                          (select count(*) from sources) as sources,
                          (select count(*) from chunks where embedding is not null) as embedded_chunks,
                          (select count(*) from knowledge_entries) as entries"""
            ).fetchone()
        return {"status": "ok", "db": True, "counts": counts, "demo_mode": settings.demo_mode}
    except Exception as e:  # health should report, not crash
        return {"status": "degraded", "db": False, "error": str(e)}
