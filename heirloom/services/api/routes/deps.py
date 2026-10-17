from typing import Dict

import sqlalchemy as sa
from fastapi import Header, HTTPException

import policy
from store.db import one, tx
from store.schema import people


def current_person(x_person_id: str = Header("jordan-kim")) -> Dict:
    """Demo identity from the top-bar user switcher (§20: no real auth)."""
    with tx() as conn:
        person = one(conn.execute(sa.select(people).where(people.c.id == x_person_id)))
    if not person:
        raise HTTPException(401, f"Unknown person: {x_person_id}")
    return person


def require_lead(person: Dict) -> None:
    if not policy.is_lead(person):
        raise HTTPException(403, "Visible to team leads only.")
