"""
PostgreSQL connection management.

A single module-level connection is reused across warm Lambda invocations.
Connections run in autocommit mode; use ``transaction()`` for multi-statement writes.
"""

import logging
import os
from contextlib import contextmanager
from typing import Any, Iterator

from psycopg import Connection, OperationalError, connect
from psycopg.rows import dict_row

logger = logging.getLogger(__name__)

_CONN: Connection | None = None


def _conninfo() -> str:
    is_local = os.getenv("IS_LOCAL", "false") == "true"
    parts = {
        "host": os.getenv("POSTGRES_HOST", "localhost"),
        "port": os.getenv("POSTGRES_PORT", "5432"),
        "user": os.getenv("POSTGRES_USER", "postgres"),
        "password": os.getenv("POSTGRES_PASS", "postgres123"),
        "dbname": os.getenv("POSTGRES_NAME", "postgres"),
        "connect_timeout": "15",
    }
    if not is_local:
        parts["sslmode"] = "require"
    return " ".join(f"{k}={v}" for k, v in parts.items())


def get_conn() -> Connection:
    """Return a live connection, reconnecting if the pooled one was closed."""
    global _CONN
    if _CONN is None or _CONN.closed or _CONN.broken:
        _CONN = connect(_conninfo(), autocommit=True, row_factory=dict_row)
    return _CONN


def reset_conn() -> None:
    """Drop the pooled connection so the next call reconnects."""
    global _CONN
    if _CONN is not None:
        try:
            _CONN.close()
        except Exception:  # pragma: no cover - best effort
            pass
    _CONN = None


@contextmanager
def transaction() -> Iterator[Connection]:
    """Run the enclosed statements atomically."""
    conn = get_conn()
    with conn.transaction():
        yield conn


def fetch_all(sql: str, params: Any = None) -> list[dict]:
    """Run a query and return every row as a dict."""
    with get_conn().cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def fetch_one(sql: str, params: Any = None) -> dict | None:
    """Run a query and return the first row, or None."""
    with get_conn().cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def execute(sql: str, params: Any = None) -> int:
    """Run a statement and return the affected row count."""
    with get_conn().cursor() as cur:
        cur.execute(sql, params)
        return cur.rowcount


def is_connection_error(exc: Exception) -> bool:
    """True when the error means the connection should be re-established."""
    return isinstance(exc, OperationalError)
