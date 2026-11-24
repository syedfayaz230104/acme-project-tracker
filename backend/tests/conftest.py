"""
Shared pytest fixtures.

Integration tests call the Lambda handler directly against a real PostgreSQL
database named ``pm_test`` (never the dev database). Create it once with:

    PGPASSWORD=postgres123 psql -h localhost -U postgres -c "CREATE DATABASE pm_test"
"""

import json
import os
import sys
from pathlib import Path

import pytest

os.environ.setdefault("IS_LOCAL", "true")
os.environ.setdefault("POSTGRES_HOST", "localhost")
os.environ["POSTGRES_NAME"] = os.getenv("TEST_POSTGRES_NAME", "pm_test")

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "core"))

from app import db, schema  # noqa: E402
from function import handler  # noqa: E402

TABLES = "budget_entries, allocations, deliverable_dependencies, deliverables, projects, users, app_config"


class Client:
    """Tiny HTTP-like client that invokes the Lambda handler with Function URL events."""

    def __init__(self, token: str | None = None):
        self.token = token

    def request(self, method: str, path: str, body=None, query=None, raw_body: str | None = None):
        headers = {"content-type": "application/json"}
        if self.token:
            headers["authorization"] = f"Bearer {self.token}"
        event = {
            "rawPath": path,
            "requestContext": {"http": {"method": method}},
            "headers": headers,
            "queryStringParameters": query,
            "body": raw_body if raw_body is not None else (json.dumps(body) if body is not None else None),
        }
        resp = handler(event)
        return resp["statusCode"], (json.loads(resp["body"]) if resp["body"] else None)

    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def post(self, path, body=None, **kw):
        return self.request("POST", path, body=body, **kw)

    def put(self, path, body=None, **kw):
        return self.request("PUT", path, body=body, **kw)

    def delete(self, path, **kw):
        return self.request("DELETE", path, **kw)


@pytest.fixture(scope="session", autouse=True)
def fresh_database():
    """Drop all tables once per session so the schema + demo seed are recreated."""
    try:
        db.execute(f"DROP TABLE IF EXISTS {TABLES} CASCADE")
    except Exception as exc:  # pragma: no cover - environment problem
        pytest.skip(f"PostgreSQL test database unavailable: {exc}")
    schema._READY = False
    yield


def login(email: str, password: str = schema.DEMO_PASSWORD) -> Client:
    status, body = Client().post("/auth/login", {"email": email, "password": password})
    assert status == 200, body
    return Client(body["access_token"])


@pytest.fixture(scope="session")
def admin() -> Client:
    return login("admin@acme.com")


@pytest.fixture(scope="session")
def manager() -> Client:
    return login("manager@acme.com")


@pytest.fixture(scope="session")
def contributor() -> Client:
    return login("contributor@acme.com")


@pytest.fixture(scope="session")
def viewer() -> Client:
    return login("viewer@acme.com")
