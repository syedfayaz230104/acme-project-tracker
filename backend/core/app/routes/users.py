"""User management endpoints. Reading is open to all roles; writes are admin-only."""

from app import crud, db
from app.auth import ROLES, hash_password, password_problem
from app.http import Forbidden, NotFound, Request, ValidationError
from app.routes import Route
from app.validation import Field, parse_bool, validate

PUBLIC_COLUMNS = "id, name, email, role, title, department, is_active, created_at, updated_at"

RULES = {
    "name": Field("str", required=True, max_len=120),
    "email": Field("email", required=True),
    "password": Field("str", required=True, max_len=200),
    "role": Field("enum", required=True, choices=ROLES),
    "title": Field("str", max_len=120),
    "department": Field("str", max_len=120),
    "is_active": Field("bool", nullable=False),
}


def _get(user_id: int) -> dict:
    user = db.fetch_one(f"SELECT {PUBLIC_COLUMNS} FROM users WHERE id = %s", (user_id,))
    if not user:
        raise NotFound("User", user_id)
    return user


def _hash_new_password(values: dict) -> None:
    if "password" in values:
        problem = password_problem(values["password"])
        if problem:
            raise ValidationError({"password": problem})
        values["password_hash"] = hash_password(values.pop("password"))


def list_users(req: Request) -> tuple[int, list]:
    """GET /users?q=&role=&department=&active="""
    q = req.query.get("q")
    where, params = crud.where_clause([
        ("(name ILIKE %s OR email ILIKE %s OR title ILIKE %s)", (f"%{q}%",) * 3 if q else None),
        ("role = %s", req.query.get("role")),
        ("department ILIKE %s", req.query.get("department")),
        ("is_active = %s", parse_bool(req.query.get("active"))),
    ])
    return 200, db.fetch_all(f"SELECT {PUBLIC_COLUMNS} FROM users{where} ORDER BY name", params)


def get_user(req: Request) -> tuple[int, dict]:
    """GET /users/{id}"""
    return 200, _get(req.int_param())


def create_user(req: Request) -> tuple[int, dict]:
    """POST /users (admin)"""
    values = validate(req.json(), RULES)
    _hash_new_password(values)
    return 201, _get(crud.insert_row("users", values))


def update_user(req: Request) -> tuple[int, dict]:
    """PUT /users/{id} (admin). Admins cannot demote or deactivate themselves."""
    user_id = req.int_param()
    values = validate(req.json(), RULES, partial=True)
    if user_id == req.user["id"]:
        if values.get("role", "admin") != "admin" or values.get("is_active") is False:
            raise Forbidden("You cannot change your own role or deactivate yourself")
    _hash_new_password(values)
    crud.update_row("users", user_id, values, "User")
    return 200, _get(user_id)


def delete_user(req: Request) -> tuple[int, None]:
    """DELETE /users/{id} (admin). Admins cannot delete themselves."""
    user_id = req.int_param()
    if user_id == req.user["id"]:
        raise Forbidden("You cannot delete your own account")
    crud.delete_row("users", user_id, "User")
    return 204, None


ROUTES = [
    Route("GET", "/users", list_users),
    Route("GET", "/users/{id}", get_user),
    Route("POST", "/users", create_user, action="manage_users"),
    Route("PUT", "/users/{id}", update_user, action="manage_users"),
    Route("DELETE", "/users/{id}", delete_user, action="manage_users"),
]
