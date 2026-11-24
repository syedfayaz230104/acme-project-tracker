"""
Declarative request validation.

Each resource declares a dict of ``Field`` rules. ``validate`` returns the cleaned
values and raises a single ValidationError listing every failing field.
"""

import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Callable

from app.http import ValidationError

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_MISSING = object()


@dataclass(frozen=True)
class Field:
    """Validation rule for a single input field."""

    kind: str  # str | int | decimal | date | bool | email | enum | int_list
    required: bool = False
    nullable: bool = True
    max_len: int = 255
    min_value: float | None = None
    max_value: float | None = None
    choices: tuple[str, ...] = ()


def _coerce(name: str, rule: Field, value: Any) -> Any:
    """Convert a raw value to its typed form or raise ValueError with a message."""
    kind = rule.kind
    if kind in ("str", "email", "enum"):
        if not isinstance(value, str):
            raise ValueError("must be a string")
        value = value.strip()
        if rule.required and not value:
            raise ValueError("is required")
        if len(value) > rule.max_len:
            raise ValueError(f"must be at most {rule.max_len} characters")
        if kind == "email":
            value = value.lower()
            if not EMAIL_RE.match(value):
                raise ValueError("must be a valid email address")
        if kind == "enum" and value not in rule.choices:
            raise ValueError(f"must be one of: {', '.join(rule.choices)}")
        return value
    if kind == "int":
        if isinstance(value, bool) or not isinstance(value, (int, str)):
            raise ValueError("must be an integer")
        try:
            value = int(value)
        except ValueError:
            raise ValueError("must be an integer") from None
    elif kind == "decimal":
        if isinstance(value, bool):
            raise ValueError("must be a number")
        try:
            value = Decimal(str(value))
        except InvalidOperation:
            raise ValueError("must be a number") from None
        if not value.is_finite():
            raise ValueError("must be a number")
        value = value.quantize(Decimal("0.01"))
    elif kind == "date":
        if not isinstance(value, str):
            raise ValueError("must be a date in YYYY-MM-DD format")
        try:
            return date.fromisoformat(value)
        except ValueError:
            raise ValueError("must be a date in YYYY-MM-DD format") from None
    elif kind == "bool":
        if not isinstance(value, bool):
            raise ValueError("must be true or false")
        return value
    elif kind == "int_list":
        if not isinstance(value, list) or not all(isinstance(v, int) and not isinstance(v, bool) for v in value):
            raise ValueError("must be a list of integer ids")
        return sorted(set(value))
    else:  # pragma: no cover - programming error
        raise AssertionError(f"Unknown field kind {kind} for {name}")

    if rule.min_value is not None and value < rule.min_value:
        raise ValueError(f"must be at least {rule.min_value:g}")
    if rule.max_value is not None and value > rule.max_value:
        raise ValueError(f"must be at most {rule.max_value:g}")
    return value


def validate(data: dict, rules: dict[str, Field], partial: bool = False,
             checks: list[Callable[[dict], dict[str, str]]] | None = None) -> dict:
    """
    Validate ``data`` against ``rules``.

    Args:
        data: Parsed JSON body.
        rules: Field name -> rule.
        partial: When True (PUT updates), only fields present are validated and
            required fields may be omitted.
        checks: Cross-field checks that receive the cleaned data and return errors.

    Returns:
        Cleaned values for the fields present in ``data`` (unknown keys are dropped).
    """
    errors: dict[str, str] = {}
    cleaned: dict[str, Any] = {}
    for name, rule in rules.items():
        value = data.get(name, _MISSING)
        if value is _MISSING:
            if rule.required and not partial:
                errors[name] = "is required"
            continue
        if value is None or (isinstance(value, str) and not value.strip() and not rule.required):
            if rule.required or not rule.nullable:
                errors[name] = "is required"
            else:
                cleaned[name] = None
            continue
        try:
            cleaned[name] = _coerce(name, rule, value)
        except ValueError as exc:
            errors[name] = str(exc)

    if not errors:
        for check in checks or []:
            errors.update(check(cleaned))
    if errors:
        raise ValidationError(errors)
    if partial and not cleaned:
        raise ValidationError({"body": "no updatable fields supplied"})
    return cleaned


def date_order_check(start: str, end: str) -> Callable[[dict], dict[str, str]]:
    """Build a cross-field check that ``end`` is not before ``start``."""

    def check(values: dict) -> dict[str, str]:
        start_v, end_v = values.get(start), values.get(end)
        if start_v and end_v and end_v < start_v:
            return {end: f"must be on or after {start}"}
        return {}

    return check


def parse_bool(value: str | None) -> bool | None:
    """Parse a query-string boolean (true/false/1/0)."""
    if value is None:
        return None
    return value.strip().lower() in ("1", "true", "yes")
