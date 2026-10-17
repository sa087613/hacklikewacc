"""Impact checks (SPEC §5.5): every other team's agent assesses a proposed change."""
from typing import Dict

import sqlalchemy as sa

import citations
import routing
from agents import HopLimitError, ask_agent
from store.db import tx
from store.schema import impact_checks, new_id, people, teams


def run_impact_check(person: Dict, change: str, from_team: str) -> Dict:
    with tx() as conn:
        others = conn.execute(sa.select(teams.c.id, teams.c.name).where(teams.c.id != from_team)
                              .order_by(teams.c.id)).all()
    results = []
    for team_id, team_name in others:
        try:
            res = ask_agent(from_team, team_id, change, [], tool="assess_impact",
                            args={"change_description": change, "from_team": from_team})
        except HopLimitError as e:
            results.append({"team": team_id, "team_name": team_name, "no_impact": True, "summary": str(e),
                            "concerns": [], "affected_areas": [], "contact": None, "withheld": []})
            continue
        r = res["result"]
        allowed = {e["source_id"] for e in res["evidence"]}
        concerns = []
        with tx() as conn:
            for c in r.get("concerns", []):
                verified, _ = citations.verify_citations(conn, c.get("citations", []), allowed)
                if verified:
                    concerns.append({"text": c["text"], "citations": verified})
            contact = None
            if concerns:
                topic = routing.best_topic(conn, team_id, change)
                ranked = routing.ranked_experts(conn, team_id, topic)
                if ranked:
                    contact = {"person_id": ranked[0]["id"], "name": ranked[0]["name"], "title": ranked[0]["title"]}
        no_impact = not concerns
        results.append({
            "team": team_id, "team_name": team_name, "no_impact": no_impact,
            "summary": r.get("summary") if not no_impact else "No impact found in this team's documented knowledge.",
            "concerns": concerns, "affected_areas": r.get("affected_areas", []) if not no_impact else [],
            "contact": contact,
            "withheld": [{k: w[k] for k in ("team", "item", "contact")} for w in res.get("withheld", [])],
        })
    check_id = new_id()
    with tx() as conn:
        conn.execute(impact_checks.insert().values(id=check_id, from_team=from_team, requested_by=person["id"],
                                                   change_description=change, results=results))
    return {"id": check_id, "from_team": from_team, "change_description": change, "results": results}
