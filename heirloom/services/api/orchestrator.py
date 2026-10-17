"""Answer flow (SPEC §11.4): own search → capability-card routing → ask_agent (max 2 hops)
→ compose from original sources → verify citations → label certainty in code → route gaps.
"""
import time
from typing import Callable, Dict, List, Optional

import sqlalchemy as sa

import citations
import events
import policy
import routing
from agents import HopLimitError, TeamAgent, ask_agent, capability_cards, evidence_from_hits
from entries import entries_for_sources, entry_for_citation
from providers import get_llm
from search import search
from store.db import one, rows, tx
from store.schema import (answer_deliveries, answers, ask_events, contributions, knowledge_entries, new_id, now,
                          people, source_topics, teams)


class Trace:
    def __init__(self, emit: Callable[[Dict], None]):
        self.emit, self.t0, self.steps = emit, time.perf_counter(), []

    def step(self, kind: str, text: str, **extra):
        ms = int((time.perf_counter() - self.t0) * 1000)
        self.steps.append({"kind": kind, "text": text, "ms": ms, **extra})
        self.emit({"type": "status", "text": text, "kind": kind, "ms": ms, **extra})


def _person(conn, pid):
    return one(conn.execute(sa.select(people).where(people.c.id == pid))) if pid else None


def answer_question(person_id: str, question: str, agent_team: Optional[str] = None,
                    emit: Callable[[Dict], None] = lambda e: None) -> Dict:
    question = question.strip()
    with tx() as conn:
        person = _person(conn, person_id)
        if not person:
            raise ValueError(f"Unknown person: {person_id}")
        agent_team = agent_team or person["team_id"]
        team = one(conn.execute(sa.select(teams).where(teams.c.id == agent_team)))
        if not team:
            raise ValueError(f"Unknown team: {agent_team}")
    asker_team = person["team_id"]
    agent = TeamAgent(agent_team)
    trace = Trace(emit)
    token = events.current_emit.set(emit)
    try:
        trace.step("search", f"Checking {team['name']} docs…", team=agent_team)
        own = agent.ask(question, asker_team, [])
        evidence: List[Dict] = list(own["evidence"])
        withheld: List[Dict] = list(own["withheld"])
        trace.step("search_done", f"Found {len(evidence)} passages in {team['name']} docs", team=agent_team,
                   sources=len({e['source_id'] for e in evidence}))

        cards = capability_cards()
        other_cards = {t: c for t, c in cards.items() if t != agent_team}
        targets = get_llm().route(question, agent_team, other_cards)
        consulted = []
        for target in targets:
            trace.step("ask_agent", f"Asking {cards[target]['keeper']}…", team=target)
            try:
                res = ask_agent(agent_team, target, question, [])
            except HopLimitError as e:
                trace.step("blocked", f"Skipped {cards[target]['keeper']}: {e}", team=target)
                continue
            consulted.append(target)
            evidence.extend(res["evidence"])
            withheld.extend(res["withheld"])
            trace.step("agent_done", f"{cards[target]['keeper']} shared {len({e['source_id'] for e in res['evidence']})}"
                       f" sources, withheld {len(res['withheld'])}", team=target)

        trace.step("compose", "Composing answer from original sources…")
        draft = get_llm().compose_answer(question, agent_team, team["name"], evidence, cards)

        with tx() as conn:
            card = build_card(conn, draft, evidence, withheld, consulted, agent_team, question, person, trace)
            trace.step("done", "Answer ready")
            answer_id = new_id()
            card["answer_id"] = answer_id
            conn.execute(answers.insert().values(
                id=answer_id, person_id=person_id, agent_team=agent_team, question=question, card=card,
                trace=trace.steps))
            _record_usage(conn, card, person, question, agent_team)
        card["trace"] = trace.steps
        return card
    finally:
        events.current_emit.reset(token)


def build_card(conn, draft: Dict, evidence: List[Dict], withheld: List[Dict], consulted: List[str], agent_team: str,
               question: str, person: Dict, trace: Optional[Trace] = None) -> Dict:
    allowed_ids = {e["source_id"] for e in evidence}
    points, report = citations.verify_points(conn, draft.get("points", []), allowed_ids)
    if trace and (report["dropped_citations"] or report["dropped_points"]):
        trace.step("verify", f"Citation check removed {len(report['dropped_citations'])} unverifiable quote"
                   + ("" if len(report["dropped_citations"]) == 1 else "s"))
    elif trace:
        n = sum(len(p["citations"]) for p in points)
        trace.step("verify", f"Verified {n} quote{'' if n == 1 else 's'} against {'its source' if n == 1 else 'their sources'}")

    index = entries_for_sources(conn, [c["source_id"] for p in points for c in p["citations"]])
    source_numbers: Dict[str, int] = {}
    cited_entries: Dict[str, Dict] = {}
    t = now()
    for p in points:
        if p["certainty"] == "no_documented_answer":
            continue
        certainty = "documented"
        for c in p["citations"]:
            c["n"] = source_numbers.setdefault(c["source_id"], len(source_numbers) + 1)
            e = entry_for_citation(index, c)
            if e:
                c["entry_id"] = e["id"]
                cited_entries[e["id"]] = e
                certainty = "expert_verified"
        p["certainty"] = certainty  # labeled in code, never trusted from the model

    answered = [p for p in points if p["certainty"] != "no_documented_answer"]
    gaps = list(draft.get("gaps") or [])
    if not answered and not gaps:
        gaps = [{"team": agent_team, "question": question}]
        points.append({"text": "No documented answer yet.", "certainty": "no_documented_answer", "citations": []})

    lead = draft.get("lead") or ""
    if not answered:
        lead = "I don't have a documented answer for this yet."
    elif report["dropped_points"] and lead not in {p["text"] for p in answered}:
        lead = answered[0]["text"]  # the original lead lost its support

    titles = {e["source_id"]: e for e in evidence}
    sources_list = sorted(
        [{"n": n, "source_id": sid, "title": titles[sid]["title"], "team": titles[sid]["team"],
          "source_type": titles[sid]["type"]} for sid, n in source_numbers.items()],
        key=lambda s: s["n"],
    )

    verified_by, reconfirm, conflict = None, None, None
    approved = [e for e in cited_entries.values() if e["status"] in ("approved", "expired")]
    if approved:
        newest = max(approved, key=lambda e: e["verified_at"] or t)
        verified_by = {"person": newest["verified_by_name"], "person_id": newest["verified_by"],
                       "date": newest["verified_at"].date().isoformat() if newest["verified_at"] else None,
                       "entry_id": newest["id"]}
    expired = [e for e in cited_entries.values() if e["status"] == "expired"]
    if expired:
        e = expired[0]
        reconfirm = {"entry_id": e["id"], "last_verified": e["verified_at"].date().isoformat(),
                     "months_ago": policy.months_ago(e["verified_at"], t),
                     "requested": e["reconfirm_requested_at"] is not None}
    conflicted = [e for e in cited_entries.values() if e["status"] == "conflicted"]
    if conflicted:
        conflict = conflict_view(conn, conflicted[0])

    pending = None
    for g in gaps:
        gap_team = g.get("team") if g.get("team") in {r for r in conn.execute(sa.select(teams.c.id)).scalars()} else agent_team
        item = routing.route_question(conn, question=g.get("question") or question, team_id=gap_team,
                                      asker_person_id=person["id"], via_team_id=agent_team)
        view = routing.item_view(conn, item)
        if trace:
            trace.step("route", f"No documented answer. Asked {view['person']} ({gap_team})"
                       + (" · merged with an open question" if view["merged"] else ""), team=gap_team)
        pending = pending or view

    # Withheld: one notice per item, never its content.
    seen, withheld_out = set(), []
    for w in withheld:
        if w["source_id"] not in seen:
            seen.add(w["source_id"])
            withheld_out.append({k: w[k] for k in ("team", "item", "contact", "contact_id")})

    if conflict:  # never pick a winner between approved answers (§6)
        lead = "Approved answers on this disagree. Both are shown below until the knowledge owner resolves it."
    state = "conflict" if conflict else ("answer" if answered else "no_answer")
    return {
        "agent_team": agent_team,
        "question": question,
        "state": state,
        "lead": lead,
        "points": points,
        "sources": sources_list,
        "consulted_teams": consulted,
        "verified_by": verified_by,
        "withheld": withheld_out,
        "pending_expert": pending,
        "needs_reconfirmation": reconfirm,
        "conflict": conflict,
        "entry_ids": list(cited_entries),
        "verification": {"dropped_citations": len(report["dropped_citations"]),
                         "dropped_points": len(report["dropped_points"])},
    }


def conflict_view(conn, entry: Dict) -> Dict:
    from knowledge import entry_view

    partners = rows(conn.execute(sa.select(knowledge_entries).where(
        knowledge_entries.c.topic_id == entry["topic_id"], knowledge_entries.c.status == "conflicted")))
    owner = policy.knowledge_owner(conn, entry["team_id"])
    return {
        "topic_id": entry["topic_id"],
        "entries": [entry_view(conn, e) for e in partners],
        "routed_to": owner["name"] if owner else None,
        "routed_to_id": owner["id"] if owner else None,
    }


def _record_usage(conn, card: Dict, person: Dict, question: str, agent_team: str):
    topic_id = None
    cited = [c["source_id"] for p in card["points"] for c in p["citations"]]
    if cited:
        topic_id = conn.execute(sa.select(source_topics.c.topic_id).where(
            source_topics.c.source_id == cited[0])).scalar()
    conn.execute(ask_events.insert().values(id=new_id(), person_id=person["id"], team_id=agent_team,
                                            topic_id=topic_id, question=question))
    # Deliveries power correction notices; contributions power "helped N people".
    for entry_id in card["entry_ids"]:
        exists = conn.execute(sa.select(answer_deliveries.c.entry_id).where(
            answer_deliveries.c.entry_id == entry_id, answer_deliveries.c.person_id == person["id"])).first()
        if exists:
            continue
        conn.execute(answer_deliveries.insert().values(entry_id=entry_id, person_id=person["id"],
                                                       answer_id=card.get("answer_id")))
        expert = conn.execute(sa.select(knowledge_entries.c.verified_by).where(
            knowledge_entries.c.id == entry_id)).scalar()
        if expert and expert != person["id"]:
            row = conn.execute(sa.select(contributions).where(
                contributions.c.person_id == expert, contributions.c.entry_id == entry_id)).first()
            if row:
                conn.execute(contributions.update().where(
                    contributions.c.person_id == expert, contributions.c.entry_id == entry_id
                ).values(helped_count=contributions.c.helped_count + 1))
            else:
                conn.execute(contributions.insert().values(person_id=expert, entry_id=entry_id, helped_count=1))
