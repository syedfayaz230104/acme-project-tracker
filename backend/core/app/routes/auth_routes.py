"""Authentication endpoints: login, token refresh and current user."""

from app import db
from app.auth import (
    authenticate,
    decode_token,
    hash_password,
    issue_tokens,
    load_active_user,
    password_problem,
    permissions_for,
    verify_password,
)
from app.http import Request, Unauthorized, ValidationError
from app.routes import Route
from app.validation import Field, validate

LOGIN_RULES = {
    "email": Field("email", required=True),
    "password": Field("str", required=True, max_len=200),
}


def _public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "title": user.get("title"),
        "department": user.get("department"),
        "permissions": permissions_for(user["role"]),
    }


def login(req: Request) -> tuple[int, dict]:
    """POST /auth/login - exchange email + password for tokens."""
    data = validate(req.json(), LOGIN_RULES)
    user = db.fetch_one("SELECT * FROM users WHERE email = %s", (data["email"],))
    if user is None:
        hash_password(data["password"])  # same cost as a real check, avoids user enumeration by timing
        raise Unauthorized("Invalid email or password")
    if not verify_password(data["password"], user["password_hash"]):
        raise Unauthorized("Invalid email or password")
    if not user["is_active"]:
        raise Unauthorized("User account is inactive")
    return 200, {**issue_tokens(user), "user": _public_user(user)}


def refresh(req: Request) -> tuple[int, dict]:
    """POST /auth/refresh - exchange a refresh token for a new token pair."""
    data = validate(req.json(), {"refresh_token": Field("str", required=True, max_len=2000)})
    claims = decode_token(data["refresh_token"], "refresh")
    user = load_active_user(int(claims["sub"]))
    return 200, {**issue_tokens(user), "user": _public_user(user)}


def me(req: Request) -> tuple[int, dict]:
    """GET /auth/me - the authenticated user's profile and permissions."""
    return 200, _public_user(req.user)


def change_password(req: Request) -> tuple[int, None]:
    """PUT /auth/password - change the authenticated user's own password."""
    data = validate(req.json(), {
        "current_password": Field("str", required=True, max_len=200),
        "new_password": Field("str", required=True, max_len=200),
    })
    row = db.fetch_one("SELECT password_hash FROM users WHERE id = %s", (req.user["id"],))
    if not verify_password(data["current_password"], row["password_hash"]):
        raise ValidationError({"current_password": "is incorrect"})
    problem = password_problem(data["new_password"])
    if problem:
        raise ValidationError({"new_password": problem})
    db.execute(
        "UPDATE users SET password_hash = %s, updated_at = now() WHERE id = %s",
        (hash_password(data["new_password"]), req.user["id"]),
    )
    return 204, None


def health(req: Request) -> tuple[int, dict]:
    """GET /health - liveness check including database connectivity."""
    db.fetch_one("SELECT 1")
    return 200, {"status": "ok"}


ROUTES = [
    Route("GET", "/health", health, action=None),
    Route("POST", "/auth/login", login, action=None),
    Route("POST", "/auth/refresh", refresh, action=None),
    Route("GET", "/auth/me", me),
    Route("PUT", "/auth/password", change_password),
]
