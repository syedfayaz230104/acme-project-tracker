"""
Reusable CRUD helpers shared by every resource module.

Column names always come from validation rule keys (trusted code), never from
user input, and are quoted with ``psycopg.sql.Identifier``.
"""

from typing import Any

from psycopg import errors, sql

from app import db
from app.http import Conflict, NotFound, ValidationError


def ensure_exists(table: str, row_id: int | None, field: str) -> None:
    """Raise a 400 on ``field`` if a referenced row does not exist (None is allowed)."""
    if row_id is None:
        return
    query = sql.SQL("SELECT 1 FROM {} WHERE id = %s").format(sql.Identifier(table))
    if db.fetch_one(query, (row_id,)) is None:
        raise ValidationError({field: f"{table[:-1]} {row_id} does not exist"})


def insert_row(table: str, values: dict[str, Any]) -> int:
    """Insert a row and return its id."""
    cols = list(values)
    query = sql.SQL("INSERT INTO {} ({}) VALUES ({}) RETURNING id").format(
        sql.Identifier(table),
        sql.SQL(", ").join(map(sql.Identifier, cols)),
        sql.SQL(", ").join(sql.Placeholder() * len(cols)),
    )
    return _run_write(lambda: db.fetch_one(query, [values[c] for c in cols])["id"])


def update_row(table: str, row_id: int, values: dict[str, Any], resource: str) -> None:
    """Update the given columns of a row, raising 404 if it does not exist."""
    if values:
        assignments = sql.SQL(", ").join(
            sql.SQL("{} = {}").format(sql.Identifier(c), sql.Placeholder()) for c in values
        )
        query = sql.SQL("UPDATE {} SET {}, updated_at = now() WHERE id = %s").format(
            sql.Identifier(table), assignments
        )
        count = _run_write(lambda: db.execute(query, [*values.values(), row_id]))
    else:
        count = db.execute(sql.SQL("SELECT 1 FROM {} WHERE id = %s").format(sql.Identifier(table)), (row_id,))
    if count == 0:
        raise NotFound(resource, row_id)


def delete_row(table: str, row_id: int, resource: str) -> None:
    """Delete a row, raising 404 if it does not exist."""
    query = sql.SQL("DELETE FROM {} WHERE id = %s").format(sql.Identifier(table))
    if db.execute(query, (row_id,)) == 0:
        raise NotFound(resource, row_id)


def _run_write(fn):
    """Translate database constraint violations into API errors."""
    try:
        return fn()
    except errors.UniqueViolation as exc:
        column = (exc.diag.constraint_name or "").split("_")[1:-1]
        field = "_".join(column) or "value"
        raise Conflict(f"A record with this {field} already exists", {field: "must be unique"}) from None
    except errors.CheckViolation as exc:
        raise ValidationError({"body": f"violates rule {exc.diag.constraint_name}"}) from None
    except errors.ForeignKeyViolation:
        raise ValidationError({"body": "references a record that does not exist"}) from None


def where_clause(filters: list[tuple[str, Any]]) -> tuple[str, list[Any]]:
    """Join ``(sql_fragment, param)`` pairs into a WHERE clause, skipping None params."""
    parts, params = [], []
    for fragment, value in filters:
        if value is None or value == "":
            continue
        parts.append(fragment)
        if isinstance(value, tuple):
            params.extend(value)
        else:
            params.append(value)
    return (" WHERE " + " AND ".join(parts)) if parts else "", params


def query_int(value: str | None, name: str) -> int | None:
    """Parse an optional integer query-string parameter."""
    if value in (None, ""):
        return None
    if not value.lstrip("-").isdigit():
        raise ValidationError({name: "must be an integer"})
    return int(value)
