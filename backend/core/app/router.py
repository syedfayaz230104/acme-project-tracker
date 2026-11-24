"""
Request routing, central authentication/authorization and error handling.

Flow for every request: parse -> ensure schema -> match route -> authenticate ->
authorize (role permission) -> handler -> JSON response.
"""

import logging
import re
import time

from app import db
from app.auth import authenticate, require
from app.http import ApiError, NotFound, Request, error_response, respond
from app.routes import Route, allocations, auth_routes, budget, dashboard, deliverables, projects, users
from app.schema import ensure_schema

logger = logging.getLogger(__name__)

ALL_ROUTES: list[Route] = [
    *auth_routes.ROUTES,
    *users.ROUTES,
    *projects.ROUTES,
    *deliverables.ROUTES,
    *allocations.ROUTES,
    *budget.ROUTES,
    *dashboard.ROUTES,
]


def _compile(pattern: str) -> re.Pattern:
    return re.compile("^" + re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", pattern) + "$")


_COMPILED = [(_compile(r.pattern), r) for r in ALL_ROUTES]


def match(method: str, path: str) -> tuple[Route, dict[str, str]]:
    """Find the route for a method + path, raising 404 or 405."""
    path_matched = False
    for regex, route in _COMPILED:
        found = regex.match(path)
        if found:
            path_matched = True
            if route.method == method:
                return route, found.groupdict()
    if path_matched:
        raise ApiError(405, "method_not_allowed", f"Method {method} not allowed on {path}")
    raise NotFound("Endpoint", path)


def _handle(req: Request) -> dict:
    ensure_schema()
    route, params = match(req.method, req.path)
    req.params = params
    if route.action is not None:
        req.user = authenticate(req)
        require(req.user, route.action)
    status, body = route.handler(req)
    return respond(status, body)


def dispatch(event: dict) -> dict:
    """Handle one Lambda event end-to-end and always return an HTTP response."""
    started = time.perf_counter()
    req = Request.from_event(event)
    if req.method == "OPTIONS":
        return respond(204)
    try:
        try:
            response = _handle(req)
        except Exception as exc:
            if not db.is_connection_error(exc) or req.method != "GET":
                raise
            logger.warning("Database connection lost, retrying once: %s", exc)
            db.reset_conn()
            response = _handle(req)
    except ApiError as err:
        response = error_response(err)
    except Exception as exc:  # noqa: BLE001 - last-resort guard, details go to logs only
        logger.exception("Unhandled error on %s %s", req.method, req.path)
        if db.is_connection_error(exc):
            db.reset_conn()
            response = error_response(ApiError(503, "database_unavailable", "Database is temporarily unavailable"))
        else:
            response = error_response(ApiError(500, "internal_error", "An unexpected error occurred"))
    logger.info(
        "%s %s -> %s (%.0f ms) user=%s",
        req.method, req.path, response["statusCode"], (time.perf_counter() - started) * 1000,
        req.user["id"] if req.user else "-",
    )
    return response
