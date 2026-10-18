"""Team agents ("Keepers") and agent-to-agent calls (SPEC §11).

One TeamAgent class serves every team; it is scoped by team_id in every query.
The orchestrator reaches agents through call_agent(), either in-process or over
MCP (one stdio server per team, services/team-agent/server.py). The §6 rules for
agent-to-agent calls (hop limit, no loops, share policy, logging) live here and
run the same way under both transports.
"""
import json
import re
import time
from typing import Dict, List, Optional

import sqlalchemy as sa

import events
import policy
from config import settings
from entries import entries_for_sources
from search import search
from store.db import one, rows, tx
from store.schema import agent_calls, new_id, people, sources, teams, topic_knowers, topics

PROGRESS_TITLES = re.compile(r"sprint|roadmap|design doc|plan", re.I)
RULE_TITLES = re.compile(r"policy|rules", re.I)


class HopLimitError(Exception):
    pass


def keeper_name(team_name: str) -> str:
    return f"{team_name.split(' &')[0]} Keeper"


def evidence_from_hits(conn: sa.Connection, hits) -> List[Dict]:
    index = entries_for_sources(conn, [h.source_id for h in hits])
    out = []
    for h in hits:
        backing = index.get(h.source_id, [])
        whole = next((e for e in backing if e["span"] is None), None)
        out.append({
            "source_id": h.source_id, "team": h.team_id, "title": h.title, "type": h.source_type,
            "text": h.text, "score": h.score,
            "entry_status": whole["status"] if whole else None,
            # Passages an approved knowledge entry vouches for (expert-verified).
            "verified_quotes": [e["question"] if e["span"] is None else
                                h.text[max(0, e["span"][0] - h.start_offset):max(0, e["span"][1] - h.start_offset)]
                                for e in backing if e["span"] is None or e["span"][0] >= h.start_offset],
        })
    return out


class TeamAgent:
    def __init__(self, team_id: str):
        self.team_id = team_id
        with tx() as conn:
            self.team = one(conn.execute(sa.select(teams).where(teams.c.id == team_id)))
        if not self.team:
            raise ValueError(f"Unknown team: {team_id}")
        self.name = keeper_name(self.team["name"])

    # ---- MCP tool: ask
    def ask(self, question: str, asker_team: str, hop_chain: List[str]) -> Dict:
        """Search this team's knowledge under asker_team's share policy. Returns original sources, not a paraphrase."""
        with tx() as conn:
            owner = policy.knowledge_owner(conn, self.team_id)
            res = search(conn, self.team_id, question, asker_team, contact=owner)
            evidence = evidence_from_hits(conn, res.allowed)
        return {"team": self.team_id, "evidence": evidence, "withheld": res.withheld}

    # ---- MCP tool: capability_card
    def capability_card(self) -> Dict:
        card = dict(self.team["capability_card"] or {})
        with tx() as conn:
            names = dict(conn.execute(sa.select(people.c.id, people.c.name)).all())
        card["contacts"] = [{**c, "name": names.get(c.get("person_id"))} for c in card.get("contacts", [])]
        return {"team": self.team_id, "name": self.team["name"], "keeper": self.name, **card}

    # ---- MCP tool: whats_in_progress
    def whats_in_progress(self) -> Dict:
        """Current plans and key rules from shareable team docs (team-only docs never leave)."""
        with tx() as conn:
            docs = rows(conn.execute(sa.select(sources).where(
                sources.c.team_id == self.team_id, sources.c.share_level != "team")))
        picked = [d for d in docs if PROGRESS_TITLES.search(d["title"]) or RULE_TITLES.search(d["title"])]
        return {
            "team": self.team_id,
            "evidence": [{"source_id": d["id"], "team": self.team_id, "title": d["title"], "type": d["type"],
                          "text": d["text"]} for d in picked],
        }

    # ---- MCP tool: assess_impact
    def assess_impact(self, change_description: str, from_team: str) -> Dict:
        from providers import get_llm

        with tx() as conn:
            owner = policy.knowledge_owner(conn, self.team_id)
            res = search(conn, self.team_id, change_description, from_team, k=14, contact=owner,
                         min_score=0.3, relative=0.1)
            evidence = evidence_from_hits(conn, res.allowed)
        result = get_llm().assess_impact(self.team_id, self.team["name"], change_description, from_team, evidence)
        return {"team": self.team_id, "result": result, "evidence": evidence, "withheld": res.withheld}

    # ---- MCP tool: sole_source_topics
    def sole_source_topics(self, person_id: str) -> List[Dict]:
        """Topics (any team) where this person is the only knower."""
        with tx() as conn:
            counts = rows(conn.execute(
                sa.select(topic_knowers.c.topic_id, sa.func.count(sa.distinct(topic_knowers.c.person_id)).label("n"))
                .group_by(topic_knowers.c.topic_id)
            ))
            mine = set(conn.execute(sa.select(topic_knowers.c.topic_id).where(
                topic_knowers.c.person_id == person_id)).scalars())
            ids = [c["topic_id"] for c in counts if c["n"] == 1 and c["topic_id"] in mine]
            return rows(conn.execute(sa.select(topics).where(topics.c.id.in_(ids)).order_by(topics.c.name)))


# --------------------------------------------------------------------- transport

def call_agent(team_id: str, tool: str, args: Dict):
    if settings.effective_agent_transport == "mcp":
        from mcp_transport import call_tool

        return call_tool(team_id, tool, args)
    return getattr(TeamAgent(team_id), tool)(**args)


def capability_cards(exclude: Optional[str] = None) -> Dict[str, Dict]:
    with tx() as conn:
        ids = conn.execute(sa.select(teams.c.id).order_by(teams.c.id)).scalars().all()
    return {t: call_agent(t, "capability_card", {}) for t in ids if t != exclude}


def ask_agent(from_team: str, to_team: str, question: str, hop_chain: List[str], tool: str = "ask",
              args: Optional[Dict] = None) -> Dict:
    """Call another team's agent, enforcing §6: max hops, no loops, everything logged."""
    chain = list(hop_chain) + [from_team]
    blocked = None
    if to_team in chain:
        blocked = f"{to_team} is already in the chain {chain}"
    elif len(chain) > settings.max_hops:
        blocked = f"hop limit of {settings.max_hops} reached"
    if blocked:
        with tx() as conn:
            conn.execute(agent_calls.insert().values(
                id=new_id(), from_team=from_team, to_team=to_team, tool=tool, question=question,
                hop_chain=chain, blocked_reason=blocked, latency_ms=0))
        raise HopLimitError(blocked)

    call_id = new_id()
    events.publish({"type": "edge_start", "id": call_id, "from": from_team, "to": to_team, "question": question,
                    "tool": tool})
    t0 = time.perf_counter()
    if tool == "ask":
        result = call_agent(to_team, "ask", {"question": question, "asker_team": chain[0], "hop_chain": chain})
    else:
        result = call_agent(to_team, tool, args or {})
    latency = int((time.perf_counter() - t0) * 1000)
    shared = list(dict.fromkeys(e["source_id"] for e in result.get("evidence", [])))
    withheld = result.get("withheld", [])
    with tx() as conn:
        conn.execute(agent_calls.insert().values(
            id=call_id, from_team=from_team, to_team=to_team, tool=tool, question=question, hop_chain=chain,
            shared_source_ids=shared, withheld=withheld, latency_ms=latency))
    events.publish({"type": "edge_end", "id": call_id, "from": from_team, "to": to_team, "latency_ms": latency,
                    "shared": len(shared), "withheld": len(withheld), "tool": tool})
    return result


def dumps(obj) -> str:
    return json.dumps(obj, default=str)
