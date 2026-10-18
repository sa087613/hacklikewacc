"""Database provider: Postgres (+pgvector) when DATABASE_URL is real, else SQLite."""
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional

import os

import sqlalchemy as sa
from sqlalchemy import event
from sqlalchemy.pool import NullPool

from config import settings
from store.schema import metadata

_engine: Optional[sa.Engine] = None


def backend() -> str:
    return settings.provider_status()["database"]


def engine() -> sa.Engine:
    global _engine
    if _engine is None:
        if backend() == "postgres":
            url = settings.effective_database_url
            for prefix in ("postgresql://", "postgres://"):  # Neon/Vercel hand out either form
                if url.startswith(prefix):
                    url = "postgresql+psycopg://" + url[len(prefix):]
            # prepare_threshold=None: Supabase's pooler does not support prepared statements.
            # Serverless instances are short-lived: open a connection per use instead of pooling.
            pool = {"poolclass": NullPool} if os.environ.get("VERCEL") else {"pool_pre_ping": True}
            _engine = sa.create_engine(url, connect_args={"prepare_threshold": None}, **pool)
        else:
            settings.data_dir.mkdir(parents=True, exist_ok=True)
            _engine = sa.create_engine(
                f"sqlite:///{settings.sqlite_path}",
                connect_args={"check_same_thread": False, "timeout": 30},
            )

            @event.listens_for(_engine, "connect")
            def _pragmas(dbapi_conn, _):
                cur = dbapi_conn.cursor()
                cur.execute("PRAGMA foreign_keys=ON")
                cur.execute("PRAGMA journal_mode=WAL")  # MCP agent processes share the file
                cur.close()

    return _engine


def reset_engine() -> None:
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None


def create_all(drop: bool = False) -> None:
    eng = engine()
    if backend() == "postgres":
        with eng.begin() as conn:
            conn.execute(sa.text("create extension if not exists vector"))
    if drop:
        metadata.drop_all(eng)
    metadata.create_all(eng)


@contextmanager
def tx() -> Iterator[sa.Connection]:
    with engine().begin() as conn:
        yield conn


def rows(result) -> List[Dict[str, Any]]:
    return [dict(r._mapping) for r in result]


def one(result) -> Optional[Dict[str, Any]]:
    r = result.first()
    return dict(r._mapping) if r is not None else None
