"""
HTTP primitives: request parsing, JSON responses and API errors.

Every error leaves the API in the same shape::

    {"error": {"code": "validation_error", "message": "...", "details": {...}}}
"""

import base64
import json
import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any

logger = logging.getLogger(__name__)

SERVICE_PREFIX = "/api/core"


class ApiError(Exception):
    """An error that maps directly to an HTTP error response."""

    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}


class ValidationError(ApiError):
    """400 - the request body or query failed validation."""

    def __init__(self, details: dict[str, str], message: str = "Validation failed"):
        super().__init__(400, "validation_error", message, details)


class NotFound(ApiError):
    """404 - the requested resource does not exist."""

    def __init__(self, resource: str, resource_id: Any = None):
        suffix = f" with id {resource_id}" if resource_id is not None else ""
        super().__init__(404, "not_found", f"{resource}{suffix} not found")


class Unauthorized(ApiError):
    """401 - missing, invalid or expired credentials."""

    def __init__(self, message: str = "Authentication required"):
        super().__init__(401, "unauthorized", message)


class Forbidden(ApiError):
    """403 - authenticated, but the role is not allowed to do this."""

    def __init__(self, message: str = "You do not have permission to perform this action"):
        super().__init__(403, "forbidden", message)


class Conflict(ApiError):
    """409 - the request conflicts with existing data."""

    def __init__(self, message: str, details: dict | None = None):
        super().__init__(409, "conflict", message, details)


@dataclass
class Request:
    """A normalised HTTP request built from a Lambda Function URL event."""

    method: str
    path: str
    query: dict[str, str] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)
    raw_body: str = ""
    params: dict[str, str] = field(default_factory=dict)
    user: dict | None = None

    @classmethod
    def from_event(cls, event: dict) -> "Request":
        """Build a request from a Lambda event (Function URL payload v2 or v1)."""
        http_ctx = event.get("requestContext", {}).get("http", {})
        method = (http_ctx.get("method") or event.get("httpMethod") or "GET").upper()
        path = event.get("rawPath") or event.get("path") or "/"
        # CloudFront forwards /api/core/..., the local dev proxy strips it.
        if path.startswith(SERVICE_PREFIX):
            path = path[len(SERVICE_PREFIX):]
        path = "/" + path.strip("/")

        body = event.get("body") or ""
        if body and event.get("isBase64Encoded"):
            body = base64.b64decode(body).decode("utf-8")

        headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
        return cls(
            method=method,
            path=path,
            query=dict(event.get("queryStringParameters") or {}),
            headers=headers,
            raw_body=body,
        )

    def json(self) -> dict:
        """Parse the body as a JSON object, raising a 400 on malformed input."""
        if not self.raw_body.strip():
            return {}
        try:
            data = json.loads(self.raw_body)
        except json.JSONDecodeError as exc:
            raise ApiError(400, "malformed_json", f"Request body is not valid JSON: {exc.msg}") from exc
        if not isinstance(data, dict):
            raise ApiError(400, "malformed_json", "Request body must be a JSON object")
        return data

    def int_param(self, name: str = "id") -> int:
        """Return a path parameter as an integer, raising 404 when it is not numeric."""
        value = self.params.get(name, "")
        if not value.isdigit():
            raise NotFound("Resource", value)
        return int(value)


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(f"Unserialisable type: {type(value).__name__}")


def respond(status: int, body: Any = None) -> dict:
    """Build a Lambda HTTP response with a JSON body."""
    response = {"statusCode": status, "headers": {"Content-Type": "application/json"}}
    if status != 204:
        response["body"] = json.dumps(body, default=_json_default)
    else:
        response["body"] = ""
    return response


def error_response(err: ApiError) -> dict:
    """Convert an ApiError into the standard error envelope."""
    payload = {"code": err.code, "message": err.message}
    if err.details:
        payload["details"] = err.details
    return respond(err.status, {"error": payload})
