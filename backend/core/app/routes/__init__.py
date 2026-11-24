"""
Route modules. Each exposes ``ROUTES``: a list of ``Route`` entries.

``action`` is the permission required (see ``app.auth.ROLE_ACTIONS``);
``None`` marks a public endpoint that needs no token.
"""

from dataclasses import dataclass
from typing import Callable

from app.http import Request


@dataclass(frozen=True)
class Route:
    """A single HTTP route."""

    method: str
    pattern: str
    handler: Callable[[Request], tuple[int, object]]
    action: str | None = "read"
