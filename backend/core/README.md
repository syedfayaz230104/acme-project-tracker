# Core API – ACME Project Management

Single Python Lambda (`function.handler`) that serves the whole REST API for projects,
deliverables, resource allocations, budget tracking, users and the dashboard.

## Why one service?

All resources share one PostgreSQL schema, one auth model and many cross-resource
queries (project health needs deliverables + budget + allocations). One Lambda keeps
that logic in one place; the code is still split by feature:

```
core/
├── function.py            # Lambda entry point
├── requirements.txt       # psycopg, PyJWT
└── app/
    ├── router.py          # routing, central authN/authZ, error handling, request logging
    ├── http.py            # Request parsing, JSON responses, ApiError types
    ├── auth.py            # PBKDF2 password hashing, JWT, role → permission matrix
    ├── validation.py      # declarative field validation
    ├── crud.py            # shared insert/update/delete/filter helpers
    ├── metrics.py         # pure business rules (risk, schedule, budget, over-allocation)
    ├── schema.py          # DDL (idempotent) + demo seed data
    ├── db.py              # pooled PostgreSQL connection
    └── routes/            # one module per resource
```

The schema is created automatically on the first request (cold start), guarded by an
advisory lock. If the `users` table is empty, demo data is seeded (`SEED_DEMO_DATA=false`
disables this).

## Demo accounts

All demo users have the password `Password123`.

| Email                  | Role        | Can do                                   |
| ---------------------- | ----------- | ---------------------------------------- |
| `admin@acme.com`       | admin       | everything, incl. managing users/roles   |
| `manager@acme.com`     | manager     | full CRUD except users                   |
| `contributor@acme.com` | contributor | create/update, no delete                 |
| `viewer@acme.com`      | viewer      | read only                                |

## Local development

```sh
# 1. Vendor dependencies (LocalStack hot-reload mounts this folder as-is)
pip install -r backend/core/requirements.txt -t backend/core/.vendor \
    --platform manylinux2014_x86_64 --python-version 3.13 --only-binary=:all: --upgrade

# 2. Deploy and start
./bin/deploy-backend.sh local
./bin/start-dev.sh            # proxy: http://localhost:3001/api/core/...
```

Code changes are hot-reloaded – no redeploy needed.

## API

Base path: `/api/core` (CloudFront and the local proxy). All endpoints except
`/health`, `/auth/login` and `/auth/refresh` need `Authorization: Bearer <access_token>`.

| Method | Path                               | Permission   | Notes |
| ------ | ---------------------------------- | ------------ | ----- |
| GET    | `/health`                          | public       | DB connectivity check |
| POST   | `/auth/login`                      | public       | `{email, password}` → tokens + user |
| POST   | `/auth/refresh`                    | public       | `{refresh_token}` → new tokens |
| GET    | `/auth/me`                         | read         | current user + permissions |
| PUT    | `/auth/password`                   | read         | `{current_password, new_password}` |
| GET    | `/dashboard`                       | read         | answers all business questions in one call |
| GET    | `/projects`                        | read         | `?q=&status=&priority=&department=&manager_id=&risk=` |
| GET    | `/projects/{id}`                   | read         | includes risk level, reasons, budget & progress |
| POST/PUT/DELETE | `/projects[/{id}]`        | create/update/delete | delete cascades |
| GET    | `/deliverables`                    | read         | `?project_id=&status=&owner_id=&q=&overdue=` |
| GET    | `/deliverables/{id}/dependencies`  | read         | full upstream / downstream chain |
| POST/PUT/DELETE | `/deliverables[/{id}]`    | create/update/delete | `depends_on: [ids]`; cycles rejected |
| GET    | `/allocations`                     | read         | `?user_id=&project_id=&active=` |
| GET    | `/allocations/utilisation`         | read         | per-person load on `?date=` (default today) |
| POST/PUT/DELETE | `/allocations[/{id}]`     | create/update/delete | `allocation_pct` 1–100 |
| GET    | `/budget`                          | read         | `?project_id=&category=&from=&to=&q=` |
| POST/PUT/DELETE | `/budget[/{id}]`          | create/update/delete | spend entries |
| GET    | `/users`                           | read         | `?q=&role=&department=&active=` |
| POST/PUT/DELETE | `/users[/{id}]`           | manage_users | admin only; no self-demotion/deletion |

Status codes: `200`, `201` create, `204` delete, `400` validation, `401` auth,
`403` role, `404`, `405`, `409` conflict (duplicate / unmet dependency), `500`, `503`.

Error shape:

```json
{"error": {"code": "validation_error", "message": "Validation failed", "details": {"name": "is required"}}}
```

## Business rules

- **Risk level** (`metrics.project_health`): `off_track` if past end date or over budget;
  `at_risk` if any overdue/blocked deliverables or progress trails elapsed schedule by >20
  points; `closed` for completed/cancelled projects; otherwise `on_track`.
- **Over-allocation**: a person whose allocations active on a date sum to >100%.
- **Dependencies**: circular dependencies are rejected; a deliverable cannot be completed
  while any dependency is open. Completing sets `progress=100` and `completed_at`.

## Tests

```sh
PGPASSWORD=postgres123 psql -h localhost -U postgres -c "CREATE DATABASE pm_test"   # once
cd backend
python -m pytest tests --cov=core/app --cov-report=term-missing
```

Unit tests cover the business rules, validation and auth helpers; integration tests drive
the Lambda handler against the real `pm_test` database (RBAC, CRUD, validation, cycles,
budget roll-up, over-allocation, dashboard).
