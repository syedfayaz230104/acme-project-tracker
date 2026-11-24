"""Project endpoints, including computed health, budget and progress metrics."""

from datetime import date

from app import crud, db
from app.http import NotFound, Request, ValidationError
from app.metrics import project_health
from app.routes import Route
from app.validation import Field, date_order_check, validate

STATUSES = ("planning", "active", "on_hold", "completed", "cancelled")
PRIORITIES = ("low", "medium", "high", "critical")
RISK_LEVELS = ("on_track", "at_risk", "off_track", "closed")

RULES = {
    "name": Field("str", required=True, max_len=160),
    "description": Field("str", max_len=5000),
    "department": Field("str", max_len=120),
    "status": Field("enum", nullable=False, choices=STATUSES),
    "priority": Field("enum", nullable=False, choices=PRIORITIES),
    "start_date": Field("date", required=True),
    "end_date": Field("date", required=True),
    "budget_planned": Field("decimal", nullable=False, min_value=0, max_value=999_999_999_999),
    "manager_id": Field("int"),
}

PROJECT_SELECT = """
SELECT p.*,
       u.name                               AS manager_name,
       COALESCE(b.spent, 0)                 AS budget_spent,
       COALESCE(dl.total, 0)                AS deliverables_total,
       COALESCE(dl.completed, 0)            AS deliverables_completed,
       COALESCE(dl.overdue, 0)              AS overdue_deliverables,
       COALESCE(dl.blocked, 0)              AS blocked_deliverables,
       dl.avg_progress                      AS progress,
       COALESCE(al.headcount, 0)            AS team_size
FROM projects p
LEFT JOIN users u ON u.id = p.manager_id
LEFT JOIN (SELECT project_id, SUM(amount) AS spent FROM budget_entries GROUP BY project_id) b
       ON b.project_id = p.id
LEFT JOIN (SELECT project_id,
                  COUNT(*)                                                         AS total,
                  COUNT(*) FILTER (WHERE status = 'completed')                     AS completed,
                  COUNT(*) FILTER (WHERE status <> 'completed' AND due_date < %s) AS overdue,
                  COUNT(*) FILTER (WHERE status = 'blocked')                       AS blocked,
                  ROUND(AVG(progress))::int                                        AS avg_progress
           FROM deliverables GROUP BY project_id) dl
       ON dl.project_id = p.id
LEFT JOIN (SELECT project_id, COUNT(DISTINCT user_id) AS headcount FROM allocations
           WHERE %s BETWEEN start_date AND end_date GROUP BY project_id) al
       ON al.project_id = p.id
"""


def with_health(project: dict, today: date) -> dict:
    """Attach risk level, reasons and schedule/budget percentages to a project row."""
    project = dict(project)
    project["budget_remaining"] = project["budget_planned"] - project["budget_spent"]
    project.update(project_health(project, today))
    return project


def fetch_projects(filters: list[tuple[str, object]] | None = None, today: date | None = None) -> list[dict]:
    """Load projects with metrics, optionally filtered by ``(sql_fragment, param)`` pairs."""
    today = today or date.today()
    where, params = crud.where_clause(filters or [])
    # PROJECT_SELECT uses two positional "today" placeholders before the WHERE clause.
    rows = db.fetch_all(PROJECT_SELECT + where + " ORDER BY p.end_date, p.name", [today, today, *params])
    return [with_health(r, today) for r in rows]


def get_project_by_id(project_id: int) -> dict:
    """Load a single project with metrics or raise 404."""
    rows = fetch_projects([("p.id = %s", project_id)])
    if not rows:
        raise NotFound("Project", project_id)
    return rows[0]


def list_projects(req: Request) -> tuple[int, list]:
    """GET /projects?q=&status=&priority=&department=&manager_id=&risk="""
    q = req.query.get("q")
    risk = req.query.get("risk")
    if risk and risk not in RISK_LEVELS:
        raise ValidationError({"risk": f"must be one of: {', '.join(RISK_LEVELS)}"})
    rows = fetch_projects([
        ("(p.name ILIKE %s OR p.description ILIKE %s)", (f"%{q}%",) * 2 if q else None),
        ("p.status = %s", req.query.get("status")),
        ("p.priority = %s", req.query.get("priority")),
        ("p.department ILIKE %s", req.query.get("department")),
        ("p.manager_id = %s", crud.query_int(req.query.get("manager_id"), "manager_id")),
    ])
    if risk:
        rows = [r for r in rows if r["risk_level"] == risk]
    return 200, rows


def get_project(req: Request) -> tuple[int, dict]:
    """GET /projects/{id}"""
    return 200, get_project_by_id(req.int_param())


def create_project(req: Request) -> tuple[int, dict]:
    """POST /projects"""
    values = validate(req.json(), RULES, checks=[date_order_check("start_date", "end_date")])
    crud.ensure_exists("users", values.get("manager_id"), "manager_id")
    return 201, get_project_by_id(crud.insert_row("projects", values))


def update_project(req: Request) -> tuple[int, dict]:
    """PUT /projects/{id} - partial update; date order checked against stored values."""
    project_id = req.int_param()
    current = db.fetch_one("SELECT start_date, end_date FROM projects WHERE id = %s", (project_id,))
    if not current:
        raise NotFound("Project", project_id)
    values = validate(req.json(), RULES, partial=True,
                      checks=[lambda v: date_order_check("start_date", "end_date")({**current, **v})])
    crud.ensure_exists("users", values.get("manager_id"), "manager_id")
    crud.update_row("projects", project_id, values, "Project")
    return 200, get_project_by_id(project_id)


def delete_project(req: Request) -> tuple[int, None]:
    """DELETE /projects/{id} - cascades to deliverables, allocations and budget entries."""
    crud.delete_row("projects", req.int_param(), "Project")
    return 204, None


ROUTES = [
    Route("GET", "/projects", list_projects),
    Route("GET", "/projects/{id}", get_project),
    Route("POST", "/projects", create_project, action="create"),
    Route("PUT", "/projects/{id}", update_project, action="update"),
    Route("DELETE", "/projects/{id}", delete_project, action="delete"),
]
