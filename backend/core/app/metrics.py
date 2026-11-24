"""
Pure business rules for project health, schedule and budget metrics.

Kept free of database access so they can be unit-tested directly.
"""

from datetime import date
from decimal import Decimal

CLOSED_STATUSES = ("completed", "cancelled")
SCHEDULE_SLIP_THRESHOLD = 20  # % points progress may trail elapsed time before "at risk"
OVER_ALLOCATION_THRESHOLD = 100  # % of a person's time


def elapsed_pct(start: date, end: date, today: date) -> int:
    """Percentage of the planned schedule that has elapsed (clamped 0-100)."""
    total = (end - start).days
    if total <= 0:
        return 100 if today >= end else 0
    return max(0, min(100, round((today - start).days * 100 / total)))


def budget_used_pct(planned: Decimal | float, spent: Decimal | float) -> int | None:
    """Percentage of planned budget consumed, or None when no budget is planned."""
    if not planned:
        return None
    return round(float(spent) * 100 / float(planned))


def project_health(project: dict, today: date) -> dict:
    """
    Classify a project as on_track / at_risk / off_track / closed and explain why.

    Expects the keys produced by the projects query: status, start_date, end_date,
    budget_planned, budget_spent, progress, overdue_deliverables, blocked_deliverables.
    """
    elapsed = elapsed_pct(project["start_date"], project["end_date"], today)
    used = budget_used_pct(project["budget_planned"], project["budget_spent"])
    result = {"schedule_elapsed_pct": elapsed, "budget_used_pct": used, "risk_reasons": []}

    if project["status"] in CLOSED_STATUSES:
        return {**result, "risk_level": "closed"}

    reasons: list[str] = []
    off_track = False
    if project["end_date"] < today:
        reasons.append("Past planned end date")
        off_track = True
    if project.get("overdue_deliverables"):
        reasons.append(f"{project['overdue_deliverables']} overdue deliverable(s)")
    if project.get("blocked_deliverables"):
        reasons.append(f"{project['blocked_deliverables']} blocked deliverable(s)")
    progress = project.get("progress")
    if project["status"] == "active" and progress is not None and elapsed - progress > SCHEDULE_SLIP_THRESHOLD:
        reasons.append(f"Progress {progress}% trails schedule {elapsed}%")
    if used is not None and used > 100:
        reasons.append(f"Over budget ({used}% used)")
        off_track = True

    level = "off_track" if off_track else ("at_risk" if reasons else "on_track")
    return {**result, "risk_level": level, "risk_reasons": reasons}


def is_over_allocated(total_pct: int) -> bool:
    """True when a person's concurrent allocations exceed 100% of their time."""
    return total_pct > OVER_ALLOCATION_THRESHOLD
