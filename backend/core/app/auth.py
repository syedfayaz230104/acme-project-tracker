"""
Authentication (password hashing, JWT) and centralised role-based authorization.

Roles and what they may do:

=============  =======================================================
admin          everything, including managing users and roles
manager        create / read / update / delete projects and related data
contributor    create / read / update, but not delete
viewer         read only
=============  =======================================================
"""

import base64
import hashlib
import hmac
import os
import secrets
import time

import jwt

from app import db
from app.http import Forbidden, Request, Unauthorized

ROLES = ("admin", "manager", "contributor", "viewer")

ROLE_ACTIONS: dict[str, frozenset[str]] = {
    "admin": frozenset({"read", "create", "update", "delete", "manage_users"}),
    "manager": frozenset({"read", "create", "update", "delete"}),
    "contributor": frozenset({"read", "create", "update"}),
    "viewer": frozenset({"read"}),
}

ACCESS_TOKEN_TTL = 60 * 60  # 1 hour
REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60  # 7 days
JWT_ALGORITHM = "HS256"
PBKDF2_ITERATIONS = 150_000

_SECRET: str | None = None


# --------------------------------------------------------------------------- passwords

def hash_password(password: str, iterations: int = PBKDF2_ITERATIONS) -> str:
    """Hash a password as ``pbkdf2_sha256$<iterations>$<salt>$<hash>``."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return "$".join([
        "pbkdf2_sha256",
        str(iterations),
        base64.b64encode(salt).decode(),
        base64.b64encode(digest).decode(),
    ])


def verify_password(password: str, stored: str) -> bool:
    """Check a password against a stored hash in constant time."""
    try:
        algorithm, iterations, salt_b64, hash_b64 = stored.split("$")
    except (ValueError, AttributeError):
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt_b64), int(iterations))
    return hmac.compare_digest(digest, base64.b64decode(hash_b64))


def password_problem(password: str) -> str | None:
    """Return a message if the password is too weak, else None."""
    if len(password) < 8:
        return "must be at least 8 characters"
    if not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
        return "must contain both letters and numbers"
    return None


# --------------------------------------------------------------------------- tokens

def _secret() -> str:
    """JWT signing secret: JWT_SECRET env var, else a random secret persisted in the DB."""
    global _SECRET
    if _SECRET is None:
        _SECRET = os.getenv("JWT_SECRET") or db.fetch_one(
            "SELECT value FROM app_config WHERE key = 'jwt_secret'"
        )["value"]
    return _SECRET


def issue_tokens(user: dict) -> dict:
    """Create an access/refresh token pair for a user."""
    now = int(time.time())
    base = {"sub": str(user["id"]), "role": user["role"], "iat": now}
    access = jwt.encode({**base, "type": "access", "exp": now + ACCESS_TOKEN_TTL}, _secret(), JWT_ALGORITHM)
    refresh = jwt.encode({**base, "type": "refresh", "exp": now + REFRESH_TOKEN_TTL}, _secret(), JWT_ALGORITHM)
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "Bearer",
        "expires_in": ACCESS_TOKEN_TTL,
    }


def decode_token(token: str, expected_type: str) -> dict:
    """Decode and verify a JWT, raising 401 for anything invalid or expired."""
    try:
        claims = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise Unauthorized("Token has expired") from None
    except jwt.InvalidTokenError:
        raise Unauthorized("Invalid token") from None
    if claims.get("type") != expected_type:
        raise Unauthorized("Invalid token type")
    return claims


def load_active_user(user_id: int) -> dict:
    """Load a user by id, raising 401 if missing or deactivated."""
    user = db.fetch_one(
        "SELECT id, name, email, role, title, department, is_active FROM users WHERE id = %s",
        (user_id,),
    )
    if not user or not user["is_active"]:
        raise Unauthorized("User account is inactive or no longer exists")
    return user


def authenticate(req: Request) -> dict:
    """
    Resolve the user from the bearer token.

    The role is read from the database on every request so that role changes and
    deactivation take effect immediately, not when the token expires.
    """
    header = req.headers.get("authorization") or ""
    token = header[7:].strip() if header.lower().startswith("bearer ") else req.headers.get("x-auth-token", "")
    if not token:
        raise Unauthorized()
    claims = decode_token(token, "access")
    return load_active_user(int(claims["sub"]))


def can(user: dict, action: str) -> bool:
    """True when the user's role allows ``action``."""
    return action in ROLE_ACTIONS.get(user["role"], frozenset())


def require(user: dict, action: str) -> None:
    """Raise 403 unless the user's role allows ``action``."""
    if not can(user, action):
        raise Forbidden()


def permissions_for(role: str) -> list[str]:
    """Sorted list of actions a role may perform (sent to the frontend)."""
    return sorted(ROLE_ACTIONS.get(role, frozenset()))
