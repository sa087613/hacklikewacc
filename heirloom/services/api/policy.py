"""Shared behavior rules (SPEC §6): share levels, owners, expiry, bus factor status."""
from datetime import datetime, timedelta
from typing import Dict, Optional

import sqlalchemy as sa

from store.db import one
from store.schema import people, teams

SHARE_LEVELS = ("team", "cross_team", "company")
ENTRY_TYPES = ("regulation", "process", "roster", "decision")
DEFAULT_EXPIRY_MONTHS = {"regulation": 12, "process": 6, "roster": 3, "decision": None}


def visible(share_level: str, owner_team: str, asker_team: Optional[str]) -> bool:
    """team: owner team only. cross_team and company: any team's agent and people."""
    if share_level == "team":
        return asker_team == owner_team
    return True


def knowledge_owner(conn: sa.Connection, team_id: str) -> Optional[Dict]:
    q = (
        sa.select(people)
        .where(people.c.team_id == team_id)
        .order_by(people.c.is_knowledge_owner.desc(), (people.c.role == "lead").desc(), people.c.name)
    )
    return one(conn.execute(q))


def team_lead(conn: sa.Connection, team_id: str) -> Optional[Dict]:
    q = (
        sa.select(people)
        .where(people.c.team_id == team_id)
        .order_by((people.c.role == "lead").desc(), people.c.is_knowledge_owner.desc(), people.c.name)
    )
    return one(conn.execute(q))


def is_lead(person: Optional[Dict]) -> bool:
    return bool(person) and (person["role"] == "lead" or person["is_knowledge_owner"])


def add_months(dt: datetime, months: int) -> datetime:
    m = dt.month - 1 + months
    y, m = dt.year + m // 12, m % 12 + 1
    return dt.replace(year=y, month=m, day=min(dt.day, 28))


def expiry_months(conn: sa.Connection, team_id: str, entry_type: str) -> Optional[int]:
    defaults = conn.execute(sa.select(teams.c.expiry_defaults).where(teams.c.id == team_id)).scalar() or {}
    return defaults.get(entry_type, DEFAULT_EXPIRY_MONTHS.get(entry_type))


def expires_at(verified_at: datetime, months: Optional[int]) -> Optional[datetime]:
    return add_months(verified_at, months) if months else None


def topic_status(bus_factor: int, documented: bool) -> str:
    """§5.6: red = 1 person and undocumented; green = 3+ people and documented; else amber."""
    if bus_factor <= 1 and not documented:
        return "red"
    if bus_factor >= 3 and documented:
        return "green"
    return "amber"


def months_ago(dt: Optional[datetime], now: datetime) -> Optional[int]:
    if dt is None:
        return None
    return max(0, (now.year - dt.year) * 12 + now.month - dt.month - (1 if now.day < dt.day else 0))


def overdue(created_at: datetime, now: datetime, minutes: int) -> bool:
    return now - created_at >= timedelta(minutes=minutes)
