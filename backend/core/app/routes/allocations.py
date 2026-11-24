"""Resource allocation endpoints: who works on which project, and how much."""

from datetime import date

from app import crud, db
from app.http import NotFound, Request
from app.metrics import is_over_allocated
from app.routes import Route
from app.validation import Field, date_order_check, parse_bool, validate

RULES = {
    "user_id": Field("int", required=True),
    "project_id": Field("int", required=True),
    "role": Field("str", max_len=120),
    "allocation_pct": Field("int", required=True, min_value=1, max_value=100),
    "start_date": Field("date", required=True),
    "end_date": Field("date", required=True),
}

ALLOCATION_SELECT = """
SELECT a.*, u.name AS user_name, u.email AS user_email, p.name AS project_name
FROM allocations a
JOIN users u ON u.id = a.user_id
JOIN projects p ON p.id = a.project_id
"""

UTILISATION_SQL = """
SELECT u.id AS user_id, u.name AS user_name, u.title, u.department,
       COALESCE(SUM(a.allocation_pct), 0)::int AS total_pct,
       COUNT(a.id)::int AS project_count,
       COALESCE(json_agg(json_build_object(
           'allocation_id', a.id, 'project_id', p.id, 'project_name', p.name,
           'role', a.role, 'allocation_pct', a.allocation_pct, 'end_date', a.end_date
       ) ORDER BY a.allocation_pct DESC) FILTER (WHERE a.id IS NOT NULL), '[]') AS allocations
FROM users u
LEFT JOIN allocations a ON a.user_id = u.id AND %s BETWEEN a.start_date AND a.end_date
LEFT JOIN projects p ON p.id = a.project_id
WHERE u.is_active
GROUP BY u.id
ORDER BY total_pct DESC, u.name
"""


def utilisation(on: date) -> list[dict]:
    """Per-person allocation totals on a given date, flagged when over 100%."""
    rows = db.fetch_all(UTILISATION_SQL, (on,))
    for row in rows:
        row["over_allocated"] = is_over_allocated(row["total_pct"])
    return rows


def _get(allocation_id: int) -> dict:
    row = db.fetch_one(ALLOCATION_SELECT + " WHERE a.id = %s", (allocation_id,))
    if not row:
        raise NotFound("Allocation", allocation_id)
    return row


def _check_refs(values: dict) -> None:
    if "user_id" in values:
        crud.ensure_exists("users", values["user_id"], "user_id")
    if "project_id" in values:
        crud.ensure_exists("projects", values["project_id"], "project_id")


def list_allocations(req: Request) -> tuple[int, list]:
    """GET /allocations?user_id=&project_id=&active="""
    active = parse_bool(req.query.get("active"))
    today = date.today()
    where, params = crud.where_clause([
        ("a.user_id = %s", crud.query_int(req.query.get("user_id"), "user_id")),
        ("a.project_id = %s", crud.query_int(req.query.get("project_id"), "project_id")),
        ("(%s BETWEEN a.start_date AND a.end_date) = %s", (today, active) if active is not None else None),
    ])
    return 200, db.fetch_all(ALLOCATION_SELECT + where + " ORDER BY a.start_date DESC, u.name", params)


def get_allocation(req: Request) -> tuple[int, dict]:
    """GET /allocations/{id}"""
    return 200, _get(req.int_param())


def get_utilisation(req: Request) -> tuple[int, list]:
    """GET /allocations/utilisation?date=YYYY-MM-DD - per-person load (defaults to today)."""
    on = validate({"date": req.query["date"]}, {"date": Field("date")})["date"] if req.query.get("date") else date.today()
    return 200, utilisation(on)


def create_allocation(req: Request) -> tuple[int, dict]:
    """POST /allocations"""
    values = validate(req.json(), RULES, checks=[date_order_check("start_date", "end_date")])
    _check_refs(values)
    return 201, _get(crud.insert_row("allocations", values))


def update_allocation(req: Request) -> tuple[int, dict]:
    """PUT /allocations/{id}"""
    allocation_id = req.int_param()
    current = db.fetch_one("SELECT start_date, end_date FROM allocations WHERE id = %s", (allocation_id,))
    if not current:
        raise NotFound("Allocation", allocation_id)
    values = validate(req.json(), RULES, partial=True,
                      checks=[lambda v: date_order_check("start_date", "end_date")({**current, **v})])
    _check_refs(values)
    crud.update_row("allocations", allocation_id, values, "Allocation")
    return 200, _get(allocation_id)


def delete_allocation(req: Request) -> tuple[int, None]:
    """DELETE /allocations/{id}"""
    crud.delete_row("allocations", req.int_param(), "Allocation")
    return 204, None


ROUTES = [
    Route("GET", "/allocations", list_allocations),
    Route("GET", "/allocations/utilisation", get_utilisation),
    Route("GET", "/allocations/{id}", get_allocation),
    Route("POST", "/allocations", create_allocation, action="create"),
    Route("PUT", "/allocations/{id}", update_allocation, action="update"),
    Route("DELETE", "/allocations/{id}", delete_allocation, action="delete"),
]
