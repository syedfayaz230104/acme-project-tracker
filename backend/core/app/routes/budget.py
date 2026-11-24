"""Budget entry endpoints (actual spend recorded against a project)."""

from app import crud, db
from app.http import NotFound, Request
from app.routes import Route
from app.validation import Field, validate

CATEGORIES = ("labor", "software", "hardware", "services", "travel", "other")

RULES = {
    "project_id": Field("int", required=True),
    "category": Field("enum", required=True, choices=CATEGORIES),
    "description": Field("str", max_len=255),
    "amount": Field("decimal", required=True, min_value=0.01, max_value=999_999_999_999),
    "entry_date": Field("date", required=True),
}

BUDGET_SELECT = """
SELECT b.*, p.name AS project_name, u.name AS created_by_name
FROM budget_entries b
JOIN projects p ON p.id = b.project_id
LEFT JOIN users u ON u.id = b.created_by
"""

DATE_RULE = {"from": Field("date"), "to": Field("date")}


def _get(entry_id: int) -> dict:
    row = db.fetch_one(BUDGET_SELECT + " WHERE b.id = %s", (entry_id,))
    if not row:
        raise NotFound("Budget entry", entry_id)
    return row


def list_entries(req: Request) -> tuple[int, list]:
    """GET /budget?project_id=&category=&from=&to=&q="""
    dates = validate({k: v for k, v in req.query.items() if k in DATE_RULE}, DATE_RULE)
    q = req.query.get("q")
    where, params = crud.where_clause([
        ("b.project_id = %s", crud.query_int(req.query.get("project_id"), "project_id")),
        ("b.category = %s", req.query.get("category")),
        ("b.entry_date >= %s", dates.get("from")),
        ("b.entry_date <= %s", dates.get("to")),
        ("b.description ILIKE %s", f"%{q}%" if q else None),
    ])
    return 200, db.fetch_all(BUDGET_SELECT + where + " ORDER BY b.entry_date DESC, b.id DESC", params)


def get_entry(req: Request) -> tuple[int, dict]:
    """GET /budget/{id}"""
    return 200, _get(req.int_param())


def create_entry(req: Request) -> tuple[int, dict]:
    """POST /budget"""
    values = validate(req.json(), RULES)
    crud.ensure_exists("projects", values["project_id"], "project_id")
    values["created_by"] = req.user["id"]
    return 201, _get(crud.insert_row("budget_entries", values))


def update_entry(req: Request) -> tuple[int, dict]:
    """PUT /budget/{id}"""
    entry_id = req.int_param()
    values = validate(req.json(), RULES, partial=True)
    if "project_id" in values:
        crud.ensure_exists("projects", values["project_id"], "project_id")
    crud.update_row("budget_entries", entry_id, values, "Budget entry")
    return 200, _get(entry_id)


def delete_entry(req: Request) -> tuple[int, None]:
    """DELETE /budget/{id}"""
    crud.delete_row("budget_entries", req.int_param(), "Budget entry")
    return 204, None


ROUTES = [
    Route("GET", "/budget", list_entries),
    Route("GET", "/budget/{id}", get_entry),
    Route("POST", "/budget", create_entry, action="create"),
    Route("PUT", "/budget/{id}", update_entry, action="update"),
    Route("DELETE", "/budget/{id}", delete_entry, action="delete"),
]
