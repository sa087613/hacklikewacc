from contextlib import contextmanager

import psycopg
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row

from config import settings


def connect(register_vectors: bool = True) -> psycopg.Connection:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not set. See heirloom/.env.example.")
    # prepare_threshold=None: Supabase's pooler does not support prepared statements.
    conn = psycopg.connect(settings.database_url, row_factory=dict_row, prepare_threshold=None)
    if register_vectors:
        register_vector(conn)
    return conn


@contextmanager
def transaction():
    conn = connect()
    try:
        with conn.transaction():
            yield conn
    finally:
        conn.close()
