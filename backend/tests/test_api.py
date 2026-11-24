"""Integration tests: API contracts, RBAC and business rules against real PostgreSQL."""

from conftest import Client, login


def new_project(client, **overrides):
    body = {"name": "Test Project", "start_date": "2026-01-01", "end_date": "2026-12-31",
            "budget_planned": 1000, **overrides}
    status, data = client.post("/projects", body)
    assert status == 201, data
    return data


class TestAuth:
    def test_health_is_public(self):
        assert Client().get("/health") == (200, {"status": "ok"})

    def test_login_wrong_password(self):
        status, body = Client().post("/auth/login", {"email": "admin@acme.com", "password": "nope"})
        assert status == 401
        assert body["error"]["code"] == "unauthorized"

    def test_protected_endpoint_requires_token(self):
        assert Client().get("/projects")[0] == 401

    def test_invalid_token(self):
        status, body = Client("not-a-jwt").get("/projects")
        assert status == 401 and body["error"]["message"] == "Invalid token"

    def test_refresh_token_cannot_be_used_as_access_token(self):
        _, tokens = Client().post("/auth/login", {"email": "viewer@acme.com", "password": "Password123"})
        assert Client(tokens["refresh_token"]).get("/projects")[0] == 401
        status, refreshed = Client().post("/auth/refresh", {"refresh_token": tokens["refresh_token"]})
        assert status == 200 and refreshed["access_token"]

    def test_me_returns_permissions(self, viewer):
        status, body = viewer.get("/auth/me")
        assert status == 200
        assert body["role"] == "viewer" and body["permissions"] == ["read"]

    def test_malformed_json(self, admin):
        status, body = admin.request("POST", "/projects", raw_body="{bad")
        assert status == 400 and body["error"]["code"] == "malformed_json"

    def test_unknown_route_and_method(self, admin):
        assert admin.get("/nope")[0] == 404
        assert admin.request("PATCH", "/projects")[0] == 405


class TestRbac:
    def test_viewer_is_read_only(self, viewer):
        assert viewer.get("/projects")[0] == 200
        status, body = viewer.post("/projects", {"name": "x"})
        assert status == 403 and body["error"]["code"] == "forbidden"

    def test_contributor_can_create_but_not_delete(self, contributor, admin):
        project = new_project(contributor, name="Contributor Project")
        assert contributor.delete(f"/projects/{project['id']}")[0] == 403
        assert admin.delete(f"/projects/{project['id']}")[0] == 204

    def test_only_admin_manages_users(self, manager, admin):
        body = {"name": "New", "email": "new@acme.com", "password": "Passw0rd1", "role": "viewer"}
        assert manager.post("/users", body)[0] == 403
        status, user = admin.post("/users", body)
        assert status == 201 and "password_hash" not in user
        assert admin.post("/users", body)[0] == 409  # duplicate email

    def test_admin_cannot_demote_or_delete_self(self, admin):
        _, me = admin.get("/auth/me")
        assert admin.put(f"/users/{me['id']}", {"role": "viewer"})[0] == 403
        assert admin.delete(f"/users/{me['id']}")[0] == 403

    def test_deactivated_user_loses_access_immediately(self, admin):
        body = {"name": "Temp", "email": "temp@acme.com", "password": "Passw0rd1", "role": "manager"}
        _, user = admin.post("/users", body)
        temp = login("temp@acme.com", "Passw0rd1")
        assert temp.get("/projects")[0] == 200
        admin.put(f"/users/{user['id']}", {"is_active": False})
        assert temp.get("/projects")[0] == 401


class TestProjects:
    def test_crud_lifecycle(self, manager):
        project = new_project(manager, name="Lifecycle")
        assert project["risk_level"] in ("on_track", "at_risk", "off_track")
        status, updated = manager.put(f"/projects/{project['id']}", {"status": "completed"})
        assert status == 200 and updated["risk_level"] == "closed"
        assert manager.get(f"/projects/{project['id']}")[0] == 200
        assert manager.delete(f"/projects/{project['id']}") == (204, None)
        assert manager.get(f"/projects/{project['id']}")[0] == 404

    def test_validation_errors(self, manager):
        status, body = manager.post("/projects", {"name": "", "start_date": "2026-05-01",
                                                  "end_date": "2026-01-01", "status": "bogus"})
        assert status == 400
        assert set(body["error"]["details"]) == {"name", "status"}

    def test_end_before_start_on_update(self, manager):
        project = new_project(manager, name="Dates")
        status, body = manager.put(f"/projects/{project['id']}", {"end_date": "2025-01-01"})
        assert status == 400 and "end_date" in body["error"]["details"]

    def test_unknown_manager_reference(self, manager):
        status, body = manager.post("/projects", {"name": "Ref", "start_date": "2026-01-01",
                                                  "end_date": "2026-02-01", "manager_id": 99999})
        assert status == 400 and "manager_id" in body["error"]["details"]

    def test_duplicate_name(self, manager):
        new_project(manager, name="Unique")
        assert manager.post("/projects", {"name": "Unique", "start_date": "2026-01-01",
                                          "end_date": "2026-02-01"})[0] == 409

    def test_filters(self, viewer):
        _, rows = viewer.get("/projects", query={"status": "active"})
        assert rows and all(r["status"] == "active" for r in rows)
        _, rows = viewer.get("/projects", query={"q": "warehouse"})
        assert [r["name"] for r in rows] == ["Data Warehouse Migration"]
        assert viewer.get("/projects", query={"risk": "bad"})[0] == 400
        assert viewer.get("/projects", query={"manager_id": "abc"})[0] == 400


class TestDeliverables:
    def test_dependencies_cycles_and_completion(self, manager):
        project = new_project(manager, name="Deps")
        base = {"project_id": project["id"], "due_date": "2026-06-01"}
        _, a = manager.post("/deliverables", {**base, "title": "A"})
        _, b = manager.post("/deliverables", {**base, "title": "B", "depends_on": [a["id"]]})
        assert b["depends_on"] == [a["id"]] and b["open_dependencies"] == 1

        # A -> B would close a cycle
        status, body = manager.put(f"/deliverables/{a['id']}", {"depends_on": [b["id"]]})
        assert status == 400 and "circular" in body["error"]["details"]["depends_on"]

        # B cannot complete while A is open
        assert manager.put(f"/deliverables/{b['id']}", {"status": "completed"})[0] == 409
        status, a_done = manager.put(f"/deliverables/{a['id']}", {"status": "completed"})
        assert status == 200 and a_done["progress"] == 100 and a_done["completed_at"]
        assert manager.put(f"/deliverables/{b['id']}", {"status": "completed"})[0] == 200

        _, chain = manager.get(f"/deliverables/{a['id']}/dependencies")
        assert [d["id"] for d in chain["downstream"]] == [b["id"]]

    def test_self_and_missing_dependency(self, manager):
        project = new_project(manager, name="Deps2")
        _, a = manager.post("/deliverables", {"project_id": project["id"], "title": "A", "due_date": "2026-06-01"})
        assert manager.put(f"/deliverables/{a['id']}", {"depends_on": [a["id"]]})[0] == 400
        assert manager.put(f"/deliverables/{a['id']}", {"depends_on": [99999]})[0] == 400

    def test_requires_existing_project(self, manager):
        status, body = manager.post("/deliverables", {"project_id": 99999, "title": "x", "due_date": "2026-01-01"})
        assert status == 400 and "project_id" in body["error"]["details"]

    def test_overdue_filter(self, viewer):
        _, rows = viewer.get("/deliverables", query={"overdue": "true"})
        assert rows and all(r["is_overdue"] for r in rows)


class TestAllocationsAndBudget:
    def test_over_allocation_detected(self, manager, admin):
        _, user = admin.post("/users", {"name": "Busy", "email": "busy@acme.com", "password": "Passw0rd1",
                                        "role": "contributor"})
        p1, p2 = new_project(manager, name="Alloc1"), new_project(manager, name="Alloc2")
        today_range = {"start_date": "2020-01-01", "end_date": "2099-12-31"}
        for p in (p1, p2):
            status, _ = manager.post("/allocations", {"user_id": user["id"], "project_id": p["id"],
                                                      "allocation_pct": 60, **today_range})
            assert status == 201
        _, rows = manager.get("/allocations/utilisation")
        busy = next(r for r in rows if r["user_id"] == user["id"])
        assert busy["total_pct"] == 120 and busy["over_allocated"] and busy["project_count"] == 2

    def test_allocation_validation(self, manager):
        status, body = manager.post("/allocations", {"user_id": 1, "project_id": 1, "allocation_pct": 150,
                                                     "start_date": "2026-01-01", "end_date": "2026-02-01"})
        assert status == 400 and "allocation_pct" in body["error"]["details"]

    def test_budget_rollup(self, contributor):
        project = new_project(contributor, name="Budget", budget_planned=1000)
        for amount in (300, 900):
            status, _ = contributor.post("/budget", {"project_id": project["id"], "category": "labor",
                                                     "amount": amount, "entry_date": "2026-03-01"})
            assert status == 201
        _, refreshed = contributor.get(f"/projects/{project['id']}")
        assert refreshed["budget_spent"] == 1200
        assert refreshed["budget_used_pct"] == 120
        assert refreshed["risk_level"] == "off_track"

    def test_budget_amount_must_be_positive(self, contributor):
        assert contributor.post("/budget", {"project_id": 1, "category": "labor", "amount": -5,
                                            "entry_date": "2026-03-01"})[0] == 400


class TestDashboard:
    def test_answers_business_questions(self, viewer):
        status, body = viewer.get("/dashboard")
        assert status == 200
        for key in ("projects", "at_risk_projects", "utilisation", "over_allocated", "budget",
                    "deliverable_status_counts", "blocked_by_dependencies", "upcoming_deliverables"):
            assert key in body
        assert any(p["name"] == "Data Warehouse Migration" for p in body["at_risk_projects"])
        assert body["budget"]["planned"] >= body["budget"]["spent"] >= 0
