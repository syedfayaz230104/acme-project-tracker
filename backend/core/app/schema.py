"""
Database schema creation and demo data seeding.

``ensure_schema`` runs once per Lambda container (cold start). It is idempotent and
guarded by an advisory lock so concurrent cold starts do not race each other.
"""

import logging
import os
import secrets
from datetime import date, timedelta

from app import db
from app.auth import hash_password

logger = logging.getLogger(__name__)

_READY = False
_LOCK_ID = 7_310_001

DDL = """
CREATE TABLE IF NOT EXISTS app_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'viewer'
                  CHECK (role IN ('admin', 'manager', 'contributor', 'viewer')),
    title         VARCHAR(120),
    department    VARCHAR(120),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(160) NOT NULL UNIQUE,
    description    TEXT,
    department     VARCHAR(120),
    status         VARCHAR(20) NOT NULL DEFAULT 'planning'
                   CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
    priority       VARCHAR(20) NOT NULL DEFAULT 'medium'
                   CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    start_date     DATE NOT NULL,
    end_date       DATE NOT NULL,
    budget_planned NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (budget_planned >= 0),
    manager_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS deliverables (
    id           SERIAL PRIMARY KEY,
    project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title        VARCHAR(200) NOT NULL,
    description  TEXT,
    status       VARCHAR(20) NOT NULL DEFAULT 'not_started'
                 CHECK (status IN ('not_started', 'in_progress', 'blocked', 'completed')),
    progress     INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    due_date     DATE NOT NULL,
    owner_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    completed_at DATE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deliverable_dependencies (
    deliverable_id INTEGER NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
    depends_on_id  INTEGER NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
    PRIMARY KEY (deliverable_id, depends_on_id),
    CHECK (deliverable_id <> depends_on_id)
);

CREATE TABLE IF NOT EXISTS allocations (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role           VARCHAR(120),
    allocation_pct INTEGER NOT NULL CHECK (allocation_pct BETWEEN 1 AND 100),
    start_date     DATE NOT NULL,
    end_date       DATE NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS budget_entries (
    id          SERIAL PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category    VARCHAR(20) NOT NULL
                CHECK (category IN ('labor', 'software', 'hardware', 'services', 'travel', 'other')),
    description VARCHAR(255),
    amount      NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    entry_date  DATE NOT NULL,
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliverables_project ON deliverables(project_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_owner ON deliverables(owner_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_depends_on ON deliverable_dependencies(depends_on_id);
CREATE INDEX IF NOT EXISTS idx_allocations_user ON allocations(user_id);
CREATE INDEX IF NOT EXISTS idx_allocations_project ON allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_budget_project ON budget_entries(project_id);
"""

DEMO_PASSWORD = "Password123"


def ensure_schema() -> None:
    """Create tables, the JWT secret and (optionally) demo data, once per container."""
    global _READY
    if _READY:
        return
    with db.transaction() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(%s)", (_LOCK_ID,))
        conn.execute(DDL)
        conn.execute(
            "INSERT INTO app_config (key, value) VALUES ('jwt_secret', %s) ON CONFLICT (key) DO NOTHING",
            (secrets.token_urlsafe(48),),
        )
        has_users = conn.execute("SELECT EXISTS (SELECT 1 FROM users) AS present").fetchone()["present"]
        if not has_users and os.getenv("SEED_DEMO_DATA", "true") == "true":
            _seed(conn)
            logger.info("Seeded demo data")
    _READY = True


def _seed(conn) -> None:
    """Insert a small, realistic demo dataset (dates relative to today)."""
    today = date.today()

    def d(days: int) -> date:
        return today + timedelta(days=days)

    users = [
        ("Ada Admin", "admin@acme.com", "admin", "Platform Administrator", "IT"),
        ("Maya Manager", "manager@acme.com", "manager", "Project Manager", "Engineering"),
        ("Carlos Contributor", "contributor@acme.com", "contributor", "Software Engineer", "Engineering"),
        ("Vera Viewer", "viewer@acme.com", "viewer", "Stakeholder", "Finance"),
        ("Priya Patel", "priya@acme.com", "contributor", "Data Engineer", "Data"),
        ("Liam Chen", "liam@acme.com", "manager", "Program Manager", "Marketing"),
    ]
    ids = {}
    for name, email, role, title, dept in users:
        ids[email] = conn.execute(
            "INSERT INTO users (name, email, password_hash, role, title, department)"
            " VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
            (name, email, hash_password(DEMO_PASSWORD), role, title, dept),
        ).fetchone()["id"]

    projects = [
        ("Customer Portal Revamp", "Rebuild the customer self-service portal.", "Engineering",
         "active", "high", d(-90), d(30), 250000, "manager@acme.com"),
        ("Data Warehouse Migration", "Move reporting workloads to the new warehouse.", "Data",
         "active", "critical", d(-120), d(-5), 400000, "manager@acme.com"),
        ("Brand Refresh Campaign", "Q-campaign for the new brand guidelines.", "Marketing",
         "planning", "medium", d(10), d(120), 80000, "liam@acme.com"),
        ("Mobile App v2", "Second major release of the mobile app.", "Engineering",
         "on_hold", "medium", d(-30), d(150), 180000, "liam@acme.com"),
    ]
    pids = []
    for name, desc, dept, status, prio, start, end, budget, mgr in projects:
        pids.append(conn.execute(
            "INSERT INTO projects (name, description, department, status, priority, start_date, end_date,"
            " budget_planned, manager_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
            (name, desc, dept, status, prio, start, end, budget, ids[mgr]),
        ).fetchone()["id"])

    deliverables = [
        (0, "UX research & wireframes", "completed", 100, d(-60), "contributor@acme.com"),
        (0, "API redesign", "in_progress", 70, d(-3), "contributor@acme.com"),
        (0, "Frontend implementation", "in_progress", 40, d(20), "priya@acme.com"),
        (0, "User acceptance testing", "not_started", 0, d(28), "manager@acme.com"),
        (1, "Schema mapping", "completed", 100, d(-80), "priya@acme.com"),
        (1, "ETL pipelines", "blocked", 55, d(-20), "priya@acme.com"),
        (1, "Report cut-over", "not_started", 0, d(-5), "contributor@acme.com"),
        (2, "Creative brief", "in_progress", 30, d(25), "liam@acme.com"),
        (3, "Feature specification", "completed", 100, d(-10), "contributor@acme.com"),
    ]
    dids = []
    for pidx, title, status, progress, due, owner in deliverables:
        dids.append(conn.execute(
            "INSERT INTO deliverables (project_id, title, status, progress, due_date, owner_id, completed_at)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id",
            (pids[pidx], title, status, progress, due, ids[owner], due if status == "completed" else None),
        ).fetchone()["id"])

    for child, parent in [(1, 0), (2, 1), (3, 2), (5, 4), (6, 5)]:
        conn.execute(
            "INSERT INTO deliverable_dependencies (deliverable_id, depends_on_id) VALUES (%s, %s)",
            (dids[child], dids[parent]),
        )

    allocations = [
        ("contributor@acme.com", 0, "Backend Developer", 60, d(-90), d(30)),
        ("contributor@acme.com", 1, "Report Developer", 50, d(-60), d(30)),
        ("priya@acme.com", 0, "Frontend Developer", 40, d(-60), d(30)),
        ("priya@acme.com", 1, "Data Engineer", 50, d(-120), d(30)),
        ("manager@acme.com", 0, "Project Manager", 50, d(-90), d(30)),
        ("manager@acme.com", 1, "Project Manager", 50, d(-120), d(30)),
        ("liam@acme.com", 2, "Program Manager", 40, d(10), d(120)),
    ]
    for email, pidx, role, pct, start, end in allocations:
        conn.execute(
            "INSERT INTO allocations (user_id, project_id, role, allocation_pct, start_date, end_date)"
            " VALUES (%s,%s,%s,%s,%s,%s)",
            (ids[email], pids[pidx], role, pct, start, end),
        )

    budget = [
        (0, "labor", "Sprint 1-6 engineering", 120000, d(-60)),
        (0, "software", "Design tooling licences", 8000, d(-80)),
        (0, "services", "Accessibility audit", 15000, d(-20)),
        (1, "labor", "Migration engineering", 310000, d(-30)),
        (1, "software", "Warehouse compute credits", 120000, d(-15)),
        (3, "labor", "Specification workshops", 20000, d(-12)),
    ]
    for pidx, cat, desc, amount, when in budget:
        conn.execute(
            "INSERT INTO budget_entries (project_id, category, description, amount, entry_date, created_by)"
            " VALUES (%s,%s,%s,%s,%s,%s)",
            (pids[pidx], cat, desc, amount, when, ids["admin@acme.com"]),
        )
