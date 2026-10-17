import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException

import standup
from impact import run_impact_check
from models import FeedbackIn, ImpactIn
from notifications import notify
from routes.deps import current_person
from store.db import one, rows, tx
from store.schema import impact_checks, insights

router = APIRouter()


@router.post("/standup/run")
def run(person=Depends(current_person)):
    """Run the agent standup now (demo button)."""
    return standup.run_standup()


@router.get("/insights")
def list_insights(person=Depends(current_person)):
    with tx() as conn:
        return standup.list_insights(conn, person)


@router.post("/insights/{insight_id}/feedback")
def feedback(insight_id: str, body: FeedbackIn, person=Depends(current_person)):
    with tx() as conn:
        try:
            return standup.feedback(conn, insight_id, body.status, person)
        except KeyError:
            raise HTTPException(404, "Insight not found")


@router.post("/insights/{insight_id}/thread")
def thread(insight_id: str, person=Depends(current_person)):
    with tx() as conn:
        row = one(conn.execute(sa.select(insights).where(insights.c.id == insight_id)))
        if not row:
            raise HTTPException(404, "Insight not found")
        for pid in row["suggested_contacts"]:
            if pid != person["id"]:
                notify(conn, pid, "thread", f"{person['name']} started a thread", row["title"] or row["description"],
                       "/insights")
    return {"notified": [p for p in row["suggested_contacts"] if p != person["id"]]}


@router.post("/impact-check")
def impact_check(body: ImpactIn, person=Depends(current_person)):
    if not body.change_description.strip():
        raise HTTPException(400, "Describe the proposed change.")
    return run_impact_check(person, body.change_description.strip(), body.from_team or person["team_id"])


@router.get("/impact-checks")
def impact_history(person=Depends(current_person)):
    with tx() as conn:
        out = rows(conn.execute(sa.select(impact_checks).order_by(impact_checks.c.created_at.desc()).limit(10)))
    return [{**r, "created_at": r["created_at"].isoformat()} for r in out]
