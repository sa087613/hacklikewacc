"""Read-only team and people lookups for the shell (user switcher, avatars)."""
from typing import List

from fastapi import APIRouter

from db import connect
from models import Person, Team

router = APIRouter()


@router.get("/teams", response_model=List[Team])
def list_teams():
    with connect(register_vectors=False) as conn:
        return conn.execute("select * from teams order by name").fetchall()


@router.get("/people", response_model=List[Person])
def list_people():
    with connect(register_vectors=False) as conn:
        return conn.execute("select * from people order by team_id, name").fetchall()
