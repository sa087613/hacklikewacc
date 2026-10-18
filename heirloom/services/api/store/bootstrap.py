"""First-run seeding, safe for serverless: runs at most once per process, never over existing data,
and on Postgres holds an advisory lock so two cold-starting instances can't seed at the same time."""
import logging
import threading

import sqlalchemy as sa

from store import db

log = logging.getLogger("heirloom")
_lock = threading.Lock()
_done = False
last_error: str = ""  # reported by /health so a failed first-run seed is visible, not a crashed function
SEED_LOCK_ID = 4242_1717  # arbitrary, app-wide


def _empty(conn) -> bool:
    if not sa.inspect(conn).has_table("teams"):
        return True
    return conn.execute(sa.text("select count(*) from teams")).scalar() == 0


def ensure_seeded() -> None:
    """Seed if needed. Never raises: on failure the error is logged, kept in last_error, and retried next request."""
    global last_error
    try:
        _ensure_seeded()
        last_error = ""
    except Exception as e:  # keep the function alive so /health can report what went wrong
        last_error = f"{type(e).__name__}: {e}"
        log.exception("first-run seeding failed")


def _ensure_seeded() -> None:
    global _done
    if _done:
        return
    with _lock:
        if _done:
            return
        from scripts.seed import seed

        if db.backend() == "postgres":
            with db.engine().connect() as conn:
                conn.execute(sa.text("select pg_advisory_lock(:k)"), {"k": SEED_LOCK_ID})
                try:
                    if _empty(conn):
                        log.warning("Empty database: seeding demo data")
                        seed(verbose=False)
                finally:
                    conn.execute(sa.text("select pg_advisory_unlock(:k)"), {"k": SEED_LOCK_ID})
        else:
            with db.engine().connect() as conn:
                empty = _empty(conn)
            if empty:
                log.warning("Empty database: seeding offline demo data")
                seed(verbose=False)
        _done = True
