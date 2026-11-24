"""
Dashboard endpoint answering the business questions in one call:

1. Current status of each active project       -> projects / status_counts
2. Projects at risk of missing deadlines        -> at_risk_projects
3. Resource allocation across projects          -> utilisation
4. Key deliverables and completion status       -> deliverable_status_counts / upcoming_deliverables
5. Over-allocated team members                  -> over_allocated
6. Dependency chain between deliverables        -> blocked_by_dependencies (+ /deliverables/{id}/dependencies)
7. Budget consumed vs planned                   -> budget
"""

from collections import Counter
from datetime import date, timedelta

from app import db
from app.routes import Route
from app.routes.allocations import utilisation
from app.routes.projects import fetch_projects
from app.http import Request

UPCOMING_DAYS = 14


def get_dashboard(req: Request) -> tuple[int, dict]:
    """GET /dashboard"""
    today = date.today()
    projects = fetch_projects(today=today)
    people = utilisation(today)
    open_projects = [p for p in projects if p["risk_level"] != "closed"]

    deliverable_counts = db.fetch_all(
        "SELECT status, COUNT(*)::int AS count FROM deliverables GROUP BY status")
    upcoming = db.fetch_all(
        """
        SELECT d.id, d.title, d.status, d.progress, d.due_date, p.id AS project_id, p.name AS project_name,
               u.name AS owner_name
        FROM deliverables d JOIN projects p ON p.id = d.project_id LEFT JOIN users u ON u.id = d.owner_id
        WHERE d.status <> 'completed' AND d.due_date <= %s
        ORDER BY d.due_date LIMIT 20
        """,
        (today + timedelta(days=UPCOMING_DAYS),),
    )
    blocked_by_deps = db.fetch_all(
        """
        SELECT d.id, d.title, p.name AS project_name,
               json_agg(json_build_object('id', up.id, 'title', up.title, 'status', up.status)) AS waiting_on
        FROM deliverables d
        JOIN projects p ON p.id = d.project_id
        JOIN deliverable_dependencies dd ON dd.deliverable_id = d.id
        JOIN deliverables up ON up.id = dd.depends_on_id AND up.status <> 'completed'
        WHERE d.status <> 'completed'
        GROUP BY d.id, p.name
        ORDER BY d.due_date
        """
    )

    total_planned = sum(p["budget_planned"] for p in open_projects)
    total_spent = sum(p["budget_spent"] for p in open_projects)

    summary = {
        "as_of": today,
        "totals": {
            "projects": len(projects),
            "active_projects": sum(1 for p in projects if p["status"] == "active"),
            "at_risk": sum(1 for p in projects if p["risk_level"] == "at_risk"),
            "off_track": sum(1 for p in projects if p["risk_level"] == "off_track"),
            "over_allocated_people": sum(1 for u in people if u["over_allocated"]),
            "overdue_deliverables": sum(p["overdue_deliverables"] for p in projects),
        },
        "status_counts": dict(Counter(p["status"] for p in projects)),
        "risk_counts": dict(Counter(p["risk_level"] for p in projects)),
        "projects": [_project_summary(p) for p in projects],
        "at_risk_projects": [_project_summary(p) for p in projects if p["risk_level"] in ("at_risk", "off_track")],
        "deliverable_status_counts": {r["status"]: r["count"] for r in deliverable_counts},
        "upcoming_deliverables": upcoming,
        "blocked_by_dependencies": blocked_by_deps,
        "utilisation": people,
        "over_allocated": [u for u in people if u["over_allocated"]],
        "budget": {
            "planned": total_planned,
            "spent": total_spent,
            "remaining": total_planned - total_spent,
            "by_project": [
                {"id": p["id"], "name": p["name"], "planned": p["budget_planned"], "spent": p["budget_spent"],
                 "used_pct": p["budget_used_pct"]}
                for p in open_projects
            ],
        },
    }
    return 200, summary


def _project_summary(p: dict) -> dict:
    keys = ("id", "name", "status", "priority", "department", "manager_name", "end_date", "progress",
            "schedule_elapsed_pct", "budget_used_pct", "risk_level", "risk_reasons",
            "deliverables_total", "deliverables_completed")
    return {k: p[k] for k in keys}


ROUTES = [Route("GET", "/dashboard", get_dashboard)]
