"""Agent standups (SPEC §5.4): overlaps, reuse, and conflicts, high precision only."""
from typing import Dict, List

import sqlalchemy as sa

import citations
import policy
from agents import call_agent
from config import settings
from notifications import notify
from providers import get_llm
from store.db import one, rows, tx
from store.schema import insights, new_id, people, teams


def thresholds(conn) -> Dict[str, float]:
    """Per-type confidence threshold, tuned by lead feedback: 'not relevant' raises it, 'useful' lowers it."""
    base = settings.insight_confidence_threshold
    out = {}
    for t in ("overlap", "reuse", "conflict"):
        fb = rows(conn.execute(sa.select(insights.c.status).where(insights.c.type == t,
                                                                  insights.c.status != "new")))
        nr = sum(1 for f in fb if f["status"] == "not_relevant")
        us = sum(1 for f in fb if f["status"] == "useful")
        out[t] = round(min(0.9, max(base, base + 0.05 * nr - 0.02 * us)), 2)
    return out


def signature(ins: Dict) -> str:
    srcs = sorted({e["source_id"] for e in ins["evidence"]})
    return f"{ins['type']}:{'+'.join(sorted(ins['teams']))}:{','.join(srcs)}"


def insight_view(conn, row: Dict) -> Dict:
    names = dict(conn.execute(sa.select(people.c.id, people.c.name)).all())
    return {
        **{k: row[k] for k in ("id", "type", "team_ids", "title", "description", "confidence", "status")},
        "created_at": row["created_at"].isoformat(),
        "evidence": row["evidence"],
        "suggested_contacts": [{"person_id": p, "name": names.get(p)} for p in row["suggested_contacts"]],
    }


def run_standup() -> Dict:
    with tx() as conn:
        team_ids = conn.execute(sa.select(teams.c.id).order_by(teams.c.id)).scalars().all()
    progress = {t: call_agent(t, "whats_in_progress", {}) for t in team_ids}
    raw = get_llm().standup(progress)
    allowed = {e["source_id"] for p in progress.values() for e in p["evidence"]}
    stats = {"proposed": len(raw), "low_confidence": 0, "unverified": 0, "suppressed": 0, "new": 0, "existing": 0}
    out: List[Dict] = []
    with tx() as conn:
        limits = thresholds(conn)
        person_ids = set(conn.execute(sa.select(people.c.id)).scalars())
        for ins in raw:
            if ins.get("type") not in limits:
                continue
            if float(ins.get("confidence", 0)) < limits[ins["type"]]:
                stats["low_confidence"] += 1
                continue
            verified, _ = citations.verify_citations(conn, ins.get("evidence", []), allowed)
            teams_with_evidence = sorted({v["team"] for v in verified})
            if len(teams_with_evidence) < 2:  # evidence from both sides, or it isn't shown
                stats["unverified"] += 1
                continue
            ins = {**ins, "teams": teams_with_evidence,
                   "evidence": [{"team": v["team"], "source_id": v["source_id"], "quote": v["quote"], "title": v["title"],
                                 "start": v["start"], "end": v["end"]} for v in verified]}
            sig = signature(ins)
            existing = one(conn.execute(sa.select(insights).where(insights.c.signature == sig)))
            if existing and existing["status"] == "not_relevant":
                stats["suppressed"] += 1
                continue
            if existing:
                stats["existing"] += 1
                out.append(insight_view(conn, existing))
                continue
            row = dict(id=new_id(), type=ins["type"], team_ids=ins["teams"], title=ins.get("title", ""),
                       description=ins["description"], evidence=ins["evidence"],
                       suggested_contacts=[p for p in ins.get("suggested_contacts", []) if p in person_ids],
                       confidence=float(ins["confidence"]), signature=sig, status="new")
            conn.execute(insights.insert().values(**row))
            stats["new"] += 1
            for t in ins["teams"]:  # right recipient: the leads of the teams involved
                lead = policy.team_lead(conn, t)
                notify(conn, lead["id"] if lead else None, "insight", f"New {ins['type']} insight", row["title"] or
                       row["description"], "/insights")
            out.append(insight_view(conn, one(conn.execute(sa.select(insights).where(insights.c.id == row["id"])))))
        stats["thresholds"] = limits
    return {"insights": out, "stats": stats}


def list_insights(conn, person: Dict) -> List[Dict]:
    q = sa.select(insights).order_by(insights.c.created_at.desc())
    out = [insight_view(conn, r) for r in rows(conn.execute(q))]
    if person:
        out = [i for i in out if person["team_id"] in i["team_ids"] or policy.is_lead(person)]
    return out


def feedback(conn, insight_id: str, status: str, person: Dict) -> Dict:
    row = one(conn.execute(sa.select(insights).where(insights.c.id == insight_id)))
    if not row:
        raise KeyError(insight_id)
    conn.execute(insights.update().where(insights.c.id == insight_id).values(status=status))
    return insight_view(conn, {**row, "status": status})
