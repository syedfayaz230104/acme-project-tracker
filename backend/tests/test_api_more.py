"""Additional API contract tests: filters, updates/deletes, password change and error paths."""

from conftest import Client, login


def project_id(client, name):
    _, rows = client.get("/projects", query={"q": name})
    return rows[0]["id"]


class TestUsersEndpoints:
    def test_list_filters_and_get(self, admin, viewer):
        _, managers = viewer.get("/users", query={"role": "manager"})
        assert managers and all(u["role"] == "manager" for u in managers)
        assert all("password_hash" not in u for u in managers)
        _, found = viewer.get("/users", query={"q": "priya", "active": "true"})
        assert [u["email"] for u in found] == ["priya@acme.com"]
        assert viewer.get(f"/users/{found[0]['id']}")[0] == 200
        assert viewer.get("/users/99999")[0] == 404
        assert viewer.get("/users/abc")[0] == 404

    def test_admin_updates_role_password_and_deletes(self, admin):
        status, user = admin.post("/users", {"name": "Role Change", "email": "role@acme.com",
                                             "password": "Passw0rd1", "role": "viewer"})
        assert status == 201
        status, updated = admin.put(f"/users/{user['id']}", {"role": "contributor", "password": "NewPassw0rd"})
        assert status == 200 and updated["role"] == "contributor"
        login("role@acme.com", "NewPassw0rd")  # new password works
        assert admin.put(f"/users/{user['id']}", {"password": "weak"})[0] == 400
        assert admin.put(f"/users/{user['id']}", {"role": "superuser"})[0] == 400
        assert admin.delete(f"/users/{user['id']}")[0] == 204
        assert admin.delete(f"/users/{user['id']}")[0] == 404


class TestPasswordChange:
    def test_change_own_password(self, admin):
        admin.post("/users", {"name": "Pw", "email": "pw@acme.com", "password": "Passw0rd1", "role": "viewer"})
        me = login("pw@acme.com", "Passw0rd1")
        assert me.put("/auth/password", {"current_password": "wrong", "new_password": "Another1pw"})[0] == 400
        assert me.put("/auth/password", {"current_password": "Passw0rd1", "new_password": "short"})[0] == 400
        assert me.put("/auth/password", {"current_password": "Passw0rd1", "new_password": "Another1pw"}) == (204, None)
        login("pw@acme.com", "Another1pw")

    def test_inactive_user_cannot_log_in_or_refresh(self, admin):
        _, user = admin.post("/users", {"name": "Gone", "email": "gone@acme.com", "password": "Passw0rd1",
                                        "role": "viewer"})
        _, tokens = Client().post("/auth/login", {"email": "gone@acme.com", "password": "Passw0rd1"})
        admin.put(f"/users/{user['id']}", {"is_active": False})
        assert Client().post("/auth/login", {"email": "gone@acme.com", "password": "Passw0rd1"})[0] == 401
        assert Client().post("/auth/refresh", {"refresh_token": tokens["refresh_token"]})[0] == 401
        assert Client().post("/auth/refresh", {"refresh_token": "garbage"})[0] == 401


class TestAllocationEndpoints:
    def test_filters_update_and_delete(self, manager):
        pid = project_id(manager, "Customer Portal")
        _, rows = manager.get("/allocations", query={"project_id": str(pid), "active": "true"})
        assert rows and all(r["project_id"] == pid for r in rows)
        alloc = rows[0]
        assert manager.get(f"/allocations/{alloc['id']}")[0] == 200

        status, updated = manager.put(f"/allocations/{alloc['id']}", {"allocation_pct": 30})
        assert status == 200 and updated["allocation_pct"] == 30
        status, body = manager.put(f"/allocations/{alloc['id']}", {"end_date": "2000-01-01"})
        assert status == 400 and "end_date" in body["error"]["details"]
        assert manager.put(f"/allocations/{alloc['id']}", {"user_id": 99999})[0] == 400
        assert manager.put("/allocations/99999", {"allocation_pct": 10})[0] == 404

        assert manager.delete(f"/allocations/{alloc['id']}")[0] == 204
        assert manager.get(f"/allocations/{alloc['id']}")[0] == 404

    def test_utilisation_on_a_date(self, viewer):
        status, rows = viewer.get("/allocations/utilisation", query={"date": "1999-01-01"})
        assert status == 200 and all(r["total_pct"] == 0 for r in rows)
        assert viewer.get("/allocations/utilisation", query={"date": "not-a-date"})[0] == 400


class TestBudgetEndpoints:
    def test_filters_update_and_delete(self, manager):
        pid = project_id(manager, "Warehouse")
        _, rows = manager.get("/budget", query={"project_id": str(pid), "category": "software"})
        assert rows and all(r["category"] == "software" and r["project_id"] == pid for r in rows)
        _, dated = manager.get("/budget", query={"from": "2000-01-01", "to": "2000-12-31"})
        assert dated == []
        assert manager.get("/budget", query={"from": "yesterday"})[0] == 400
        _, searched = manager.get("/budget", query={"q": "compute"})
        assert searched and "compute" in searched[0]["description"]

        entry = rows[0]
        assert manager.get(f"/budget/{entry['id']}")[0] == 200
        status, updated = manager.put(f"/budget/{entry['id']}", {"amount": 99.999, "category": "services"})
        assert status == 200 and updated["amount"] == 100.0 and updated["category"] == "services"
        assert manager.put(f"/budget/{entry['id']}", {"project_id": 99999})[0] == 400
        assert manager.delete(f"/budget/{entry['id']}")[0] == 204
        assert manager.get(f"/budget/{entry['id']}")[0] == 404


class TestDeliverableEndpoints:
    def test_filters_and_updates(self, manager, viewer):
        pid = project_id(manager, "Warehouse")
        _, rows = viewer.get("/deliverables", query={"project_id": str(pid), "status": "blocked"})
        assert rows and all(r["status"] == "blocked" for r in rows)
        _, searched = viewer.get("/deliverables", query={"q": "ETL"})
        assert [r["title"] for r in searched] == ["ETL pipelines"]

        target = searched[0]
        status, updated = manager.put(f"/deliverables/{target['id']}", {"status": "in_progress", "progress": 60})
        assert status == 200 and updated["progress"] == 60 and updated["completed_at"] is None
        assert manager.put(f"/deliverables/{target['id']}", {"status": "in_progress", "progress": 100})[0] == 400
        assert manager.put(f"/deliverables/{target['id']}", {"owner_id": 99999})[0] == 400
        assert manager.put("/deliverables/99999", {"progress": 1})[0] == 404

    def test_create_completed_with_open_dependency_is_rejected(self, manager):
        _, proj = manager.post("/projects", {"name": "Direct complete", "start_date": "2026-01-01",
                                             "end_date": "2026-12-31"})
        base = {"project_id": proj["id"], "due_date": "2026-05-01"}
        _, dep = manager.post("/deliverables", {**base, "title": "Open"})
        status, _ = manager.post("/deliverables", {**base, "title": "Done", "status": "completed", "depends_on": [dep["id"]]})
        assert status == 409
        assert manager.delete(f"/deliverables/{dep['id']}")[0] == 204
        assert manager.delete(f"/deliverables/{dep['id']}")[0] == 404


class TestErrorHandling:
    def test_options_preflight(self):
        assert Client().request("OPTIONS", "/projects")[0] == 204

    def test_unexpected_errors_are_masked(self, admin, monkeypatch):
        from dataclasses import replace

        from app import router

        def boom(_req):
            raise RuntimeError("secret internals")

        patched = [(rx, replace(r, handler=boom) if (r.method, r.pattern) == ("GET", "/projects") else r)
                   for rx, r in router._COMPILED]
        monkeypatch.setattr(router, "_COMPILED", patched)
        status, body = admin.get("/projects")
        assert status == 500
        assert body["error"]["code"] == "internal_error"
        assert "secret" not in body["error"]["message"]
