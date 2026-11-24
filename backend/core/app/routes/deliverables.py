"""Deliverable endpoints, including dependency management and dependency chains."""

from datetime import date

from app import crud, db
from app.http import Conflict, NotFound, Request, ValidationError
from app.routes import Route
from app.validation import Field, parse_bool, validate

STATUSES = ("not_started", "in_progress", "blocked", "completed")

RULES = {
    "project_id": Field("int", required=True),
    "title": Field("str", required=True, max_len=200),
    "description": Field("str", max_len=5000),
    "status": Field("enum", nullable=False, choices=STATUSES),
    "progress": Field("int", nullable=False, min_value=0, max_value=100),
    "due_date": Field("date", required=True),
    "owner_id": Field("int"),
    "depends_on": Field("int_list", nullable=False),
}

DELIVERABLE_SELECT = """
SELECT d.*,
       p.name  AS project_name,
       u.name  AS owner_name,
       (d.status <> 'completed' AND d.due_date < %s) AS is_overdue,
       COALESCE((SELECT array_agg(dd.depends_on_id ORDER BY dd.depends_on_id)
                 FROM deliverable_dependencies dd WHERE dd.deliverable_id = d.id), '{}') AS depends_on,
       (SELECT COUNT(*) FROM deliverable_dependencies dd
          JOIN deliverables up ON up.id = dd.depends_on_id
         WHERE dd.deliverable_id = d.id AND up.status <> 'completed') AS open_dependencies
FROM deliverables d
JOIN projects p ON p.id = d.project_id
LEFT JOIN users u ON u.id = d.owner_id
"""

CHAIN_SQL = """
WITH RECURSIVE chain(id, depth) AS (
    SELECT {next_col}, 1 FROM deliverable_dependencies WHERE {this_col} = %s
    UNION
    SELECT dd.{next_col}, c.depth + 1
    FROM deliverable_dependencies dd JOIN chain c ON dd.{this_col} = c.id
    WHERE c.depth < 50
)
SELECT d.id, d.title, d.status, d.progress, d.due_date, d.project_id, p.name AS project_name,
       MIN(c.depth) AS depth
FROM chain c
JOIN deliverables d ON d.id = c.id
JOIN projects p ON p.id = d.project_id
GROUP BY d.id, p.name
ORDER BY depth, d.due_date
"""


def _fetch(filters: list[tuple[str, object]]) -> list[dict]:
    where, params = crud.where_clause(filters)
    return db.fetch_all(DELIVERABLE_SELECT + where + " ORDER BY d.due_date, d.id", [date.today(), *params])


def _get(deliverable_id: int) -> dict:
    rows = _fetch([("d.id = %s", deliverable_id)])
    if not rows:
        raise NotFound("Deliverable", deliverable_id)
    return rows[0]


def _apply_status_rules(values: dict, current: dict | None) -> None:
    """Keep status, progress and completed_at consistent with each other."""
    status = values.get("status", current["status"] if current else "not_started")
    if status == "completed":
        values["progress"] = 100
        if not current or current["status"] != "completed":
            values["completed_at"] = date.today()
    elif "status" in values:
        values["completed_at"] = None
        if values.get("progress") == 100:
            raise ValidationError({"progress": "cannot be 100 unless status is completed"})


def _check_dependencies(deliverable_id: int | None, depends_on: list[int]) -> None:
    """Ensure every dependency exists and that adding them creates no cycle."""
    if not depends_on:
        return
    if deliverable_id in depends_on:
        raise ValidationError({"depends_on": "a deliverable cannot depend on itself"})
    found = {r["id"] for r in db.fetch_all("SELECT id FROM deliverables WHERE id = ANY(%s)", (depends_on,))}
    missing = sorted(set(depends_on) - found)
    if missing:
        raise ValidationError({"depends_on": f"deliverable(s) {missing} do not exist"})
    if deliverable_id is None:
        return  # a brand-new deliverable has no dependents, so it cannot close a cycle
    cycle = db.fetch_one(
        """
        WITH RECURSIVE up(id) AS (
            SELECT depends_on_id FROM deliverable_dependencies WHERE deliverable_id = ANY(%s)
            UNION
            SELECT dd.depends_on_id FROM deliverable_dependencies dd JOIN up ON dd.deliverable_id = up.id
        )
        SELECT 1 FROM up WHERE id = %s
        """,
        (depends_on, deliverable_id),
    )
    if cycle:
        raise ValidationError({"depends_on": "would create a circular dependency"})


def _check_can_complete(deliverable_id: int, values: dict, current: dict | None) -> None:
    """A deliverable cannot be completed while any dependency is still open."""
    if values.get("status") != "completed" or (current and current["status"] == "completed"):
        return
    deps = values.get("depends_on")
    if deps is None:
        deps = [r["depends_on_id"] for r in db.fetch_all(
            "SELECT depends_on_id FROM deliverable_dependencies WHERE deliverable_id = %s", (deliverable_id,))]
    if deps:
        open_rows = db.fetch_all(
            "SELECT id, title FROM deliverables WHERE id = ANY(%s) AND status <> 'completed'", (deps,))
        if open_rows:
            raise Conflict(
                "Cannot complete: some dependencies are not completed yet",
                {"open_dependencies": [f"#{r['id']} {r['title']}" for r in open_rows]},
            )


def _save_dependencies(conn, deliverable_id: int, depends_on: list[int]) -> None:
    conn.execute("DELETE FROM deliverable_dependencies WHERE deliverable_id = %s", (deliverable_id,))
    for dep_id in depends_on:
        conn.execute(
            "INSERT INTO deliverable_dependencies (deliverable_id, depends_on_id) VALUES (%s, %s)",
            (deliverable_id, dep_id),
        )


def list_deliverables(req: Request) -> tuple[int, list]:
    """GET /deliverables?project_id=&status=&owner_id=&q=&overdue="""
    q = req.query.get("q")
    overdue = parse_bool(req.query.get("overdue"))
    return 200, _fetch([
        ("d.project_id = %s", crud.query_int(req.query.get("project_id"), "project_id")),
        ("d.status = %s", req.query.get("status")),
        ("d.owner_id = %s", crud.query_int(req.query.get("owner_id"), "owner_id")),
        ("(d.title ILIKE %s OR d.description ILIKE %s)", (f"%{q}%",) * 2 if q else None),
        ("(d.status <> 'completed' AND d.due_date < %s) = %s", (date.today(), overdue) if overdue is not None else None),
    ])


def get_deliverable(req: Request) -> tuple[int, dict]:
    """GET /deliverables/{id}"""
    return 200, _get(req.int_param())


def get_dependency_chain(req: Request) -> tuple[int, dict]:
    """GET /deliverables/{id}/dependencies - full upstream and downstream chains."""
    deliverable = _get(req.int_param())
    upstream = db.fetch_all(CHAIN_SQL.format(next_col="depends_on_id", this_col="deliverable_id"),
                            (deliverable["id"],))
    downstream = db.fetch_all(CHAIN_SQL.format(next_col="deliverable_id", this_col="depends_on_id"),
                              (deliverable["id"],))
    return 200, {"deliverable": deliverable, "upstream": upstream, "downstream": downstream}


def create_deliverable(req: Request) -> tuple[int, dict]:
    """POST /deliverables"""
    values = validate(req.json(), RULES)
    crud.ensure_exists("projects", values["project_id"], "project_id")
    crud.ensure_exists("users", values.get("owner_id"), "owner_id")
    depends_on = values.pop("depends_on", [])
    _check_dependencies(None, depends_on)
    _apply_status_rules(values, None)
    if values.get("status") == "completed":
        _check_can_complete(0, {**values, "depends_on": depends_on}, None)
    with db.transaction() as conn:
        new_id = crud.insert_row("deliverables", values)
        _save_dependencies(conn, new_id, depends_on)
    return 201, _get(new_id)


def update_deliverable(req: Request) -> tuple[int, dict]:
    """PUT /deliverables/{id}"""
    deliverable_id = req.int_param()
    current = db.fetch_one("SELECT status FROM deliverables WHERE id = %s", (deliverable_id,))
    if not current:
        raise NotFound("Deliverable", deliverable_id)
    values = validate(req.json(), RULES, partial=True)
    if "project_id" in values:
        crud.ensure_exists("projects", values["project_id"], "project_id")
    crud.ensure_exists("users", values.get("owner_id"), "owner_id")
    depends_on = values.pop("depends_on", None)
    if depends_on is not None:
        _check_dependencies(deliverable_id, depends_on)
    _check_can_complete(deliverable_id, {**values, "depends_on": depends_on}, current)
    _apply_status_rules(values, current)
    with db.transaction() as conn:
        crud.update_row("deliverables", deliverable_id, values, "Deliverable")
        if depends_on is not None:
            _save_dependencies(conn, deliverable_id, depends_on)
    return 200, _get(deliverable_id)


def delete_deliverable(req: Request) -> tuple[int, None]:
    """DELETE /deliverables/{id}"""
    crud.delete_row("deliverables", req.int_param(), "Deliverable")
    return 204, None


ROUTES = [
    Route("GET", "/deliverables", list_deliverables),
    Route("GET", "/deliverables/{id}", get_deliverable),
    Route("GET", "/deliverables/{id}/dependencies", get_dependency_chain),
    Route("POST", "/deliverables", create_deliverable, action="create"),
    Route("PUT", "/deliverables/{id}", update_deliverable, action="update"),
    Route("DELETE", "/deliverables/{id}", delete_deliverable, action="delete"),
]
