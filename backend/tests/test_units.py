"""Unit tests for pure business logic: metrics, validation and password/token helpers."""

from datetime import date
from decimal import Decimal

import pytest

from app import auth, metrics
from app.http import Request, ValidationError
from app.validation import Field, date_order_check, validate

TODAY = date(2026, 6, 1)


def project(**overrides):
    base = {
        "status": "active",
        "start_date": date(2026, 1, 1),
        "end_date": date(2026, 12, 31),
        "budget_planned": Decimal("1000"),
        "budget_spent": Decimal("100"),
        "progress": 50,
        "overdue_deliverables": 0,
        "blocked_deliverables": 0,
    }
    return {**base, **overrides}


class TestMetrics:
    def test_elapsed_pct_clamps(self):
        assert metrics.elapsed_pct(date(2026, 1, 1), date(2026, 1, 11), date(2025, 1, 1)) == 0
        assert metrics.elapsed_pct(date(2026, 1, 1), date(2026, 1, 11), date(2026, 1, 6)) == 50
        assert metrics.elapsed_pct(date(2026, 1, 1), date(2026, 1, 11), date(2027, 1, 1)) == 100

    def test_elapsed_pct_zero_length_project(self):
        assert metrics.elapsed_pct(TODAY, TODAY, TODAY) == 100

    def test_budget_used_pct(self):
        assert metrics.budget_used_pct(Decimal("200"), Decimal("50")) == 25
        assert metrics.budget_used_pct(0, 10) is None

    def test_on_track(self):
        assert metrics.project_health(project(), TODAY)["risk_level"] == "on_track"

    def test_closed_projects_are_never_at_risk(self):
        result = metrics.project_health(project(status="completed", end_date=date(2026, 2, 1)), TODAY)
        assert result["risk_level"] == "closed"
        assert result["risk_reasons"] == []

    def test_overdue_deliverables_mark_at_risk(self):
        result = metrics.project_health(project(overdue_deliverables=2), TODAY)
        assert result["risk_level"] == "at_risk"
        assert "2 overdue deliverable(s)" in result["risk_reasons"]

    def test_progress_behind_schedule(self):
        result = metrics.project_health(project(progress=10), TODAY)  # ~41% elapsed
        assert result["risk_level"] == "at_risk"

    def test_past_end_date_is_off_track(self):
        result = metrics.project_health(project(end_date=date(2026, 5, 1)), TODAY)
        assert result["risk_level"] == "off_track"

    def test_over_budget_is_off_track(self):
        result = metrics.project_health(project(budget_spent=Decimal("1500")), TODAY)
        assert result["risk_level"] == "off_track"
        assert result["budget_used_pct"] == 150

    def test_over_allocation_threshold(self):
        assert not metrics.is_over_allocated(100)
        assert metrics.is_over_allocated(101)


class TestValidation:
    RULES = {
        "name": Field("str", required=True, max_len=5),
        "count": Field("int", min_value=0, max_value=10),
        "kind": Field("enum", choices=("a", "b")),
        "email": Field("email"),
        "start": Field("date"),
        "end": Field("date"),
        "amount": Field("decimal", min_value=0.01),
        "ids": Field("int_list"),
    }

    def test_valid_payload_is_cleaned(self):
        out = validate({"name": " ok ", "count": "3", "email": "A@B.COM", "amount": 1.005, "ids": [3, 1, 3]},
                       self.RULES)
        assert out == {"name": "ok", "count": 3, "email": "a@b.com", "amount": Decimal("1.00"), "ids": [1, 3]}

    def test_collects_every_error(self):
        with pytest.raises(ValidationError) as exc:
            validate({"name": "toolong", "count": 11, "kind": "z", "email": "nope", "start": "2026-13-01",
                      "amount": 0, "ids": ["x"]}, self.RULES)
        assert set(exc.value.details) == {"name", "count", "kind", "email", "start", "amount", "ids"}

    def test_missing_required(self):
        with pytest.raises(ValidationError) as exc:
            validate({}, self.RULES)
        assert exc.value.details == {"name": "is required"}

    def test_partial_allows_missing_required_but_not_empty(self):
        assert validate({"count": 1}, self.RULES, partial=True) == {"count": 1}
        with pytest.raises(ValidationError):
            validate({}, self.RULES, partial=True)

    def test_boolean_is_not_an_integer(self):
        with pytest.raises(ValidationError):
            validate({"name": "x", "count": True}, self.RULES)

    def test_date_order_check(self):
        with pytest.raises(ValidationError) as exc:
            validate({"name": "x", "start": "2026-02-01", "end": "2026-01-01"}, self.RULES,
                     checks=[date_order_check("start", "end")])
        assert "end" in exc.value.details


class TestAuthHelpers:
    def test_password_round_trip(self):
        stored = auth.hash_password("Secret123", iterations=1000)
        assert auth.verify_password("Secret123", stored)
        assert not auth.verify_password("wrong", stored)
        assert not auth.verify_password("Secret123", "garbage")

    def test_password_strength(self):
        assert auth.password_problem("short1")
        assert auth.password_problem("lettersonly")
        assert auth.password_problem("Good1234") is None

    def test_role_matrix(self):
        assert auth.can({"role": "admin"}, "manage_users")
        assert not auth.can({"role": "manager"}, "manage_users")
        assert auth.can({"role": "contributor"}, "update")
        assert not auth.can({"role": "contributor"}, "delete")
        assert not auth.can({"role": "viewer"}, "create")
        assert not auth.can({"role": "unknown"}, "read")


class TestRequestParsing:
    def test_strips_cloudfront_prefix(self):
        req = Request.from_event({"rawPath": "/api/core/projects/", "requestContext": {"http": {"method": "get"}}})
        assert (req.method, req.path) == ("GET", "/projects")

    def test_base64_body(self):
        req = Request.from_event({"rawPath": "/x", "body": "eyJhIjogMX0=", "isBase64Encoded": True})
        assert req.json() == {"a": 1}
