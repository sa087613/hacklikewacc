"""§6 behavior rules, enforced in backend code."""
from datetime import timedelta

import pytest
import sqlalchemy as sa

import agents
import routing
from config import settings
from store.db import rows, tx
from store.schema import agent_calls, inbox_items, knowledge_entries, now


def test_hop_limit_and_no_loops(seeded, monkeypatch):
    # Time -> Payroll is hop 1; Payroll -> Benefits (chain [time, payroll]) is hop 2: both allowed.
    agents.ask_agent("time", "payroll", "overtime", [])
    agents.ask_agent("payroll", "benefits", "eligibility", ["time"])
    # Any third hop with three teams revisits a team, so the loop rule stops it.
    with pytest.raises(agents.HopLimitError, match="already in the chain"):
        agents.ask_agent("benefits", "time", "loop back", ["time", "payroll"])
    # The hop limit itself, checked with a lower limit.
    monkeypatch.setattr(settings, "max_hops", 1)
    with pytest.raises(agents.HopLimitError, match="hop limit"):
        agents.ask_agent("payroll", "benefits", "second hop", ["time"])
    with tx() as conn:
        logged = rows(conn.execute(sa.select(agent_calls)))
    assert len(logged) == 4  # blocked attempts are logged too
    assert sum(1 for c in logged if c["blocked_reason"]) == 2


def test_share_policy_withholds_team_only_sources(seeded):
    q = "Are retroactive eligibility changes billed by the vendor?"
    outsider = agents.TeamAgent("benefits").ask(q, "time", ["time"])
    insider = agents.TeamAgent("benefits").ask(q, "benefits", [])
    assert any(w["item"] == "vendor contract terms" and w["contact"] == "Priya Nair" for w in outsider["withheld"])
    assert all("Bellwether" not in e["title"] for e in outsider["evidence"])  # no content, not even the title
    assert any("vendor" in e["title"].lower() for e in insider["evidence"])
    assert insider["withheld"] == []


def test_people_cannot_open_withheld_sources(client):
    from tests.conftest import as_

    vendor = next(s for s in client.get("/teams/benefits", headers=as_("priya-nair")).json()["sources"]
                  if s["share_level"] == "team")
    assert client.get(f"/sources/{vendor['id']}", headers=as_("jordan-kim")).status_code == 403
    assert client.get(f"/sources/{vendor['id']}", headers=as_("priya-nair")).status_code == 200


def test_expert_cap_and_overflow(seeded):
    with tx() as conn:
        distinct = ["Does PTO count toward the 60-hour threshold?", "How long is the look-back measurement period?",
                    "When does coverage start for rehires?", "Which status changes end a stability period?",
                    "Are seasonal workers measured differently?"]
        for q in distinct[: settings.expert_open_cap]:
            routing.route_question(conn, question=q,
                                   team_id="benefits", asker_person_id="jordan-kim", via_team_id="time",
                                   topic_id="benefits-eligibility")
        assert routing.open_count(conn, "marcus-hill") == settings.expert_open_cap
        item = routing.route_question(conn, question="Completely different eligibility look-back question",
                                      team_id="benefits", asker_person_id="jordan-kim", via_team_id="time",
                                      topic_id="benefits-eligibility")
    assert item["expert_id"] != "marcus-hill"
    assert item["overflow_from"] == "marcus-hill"


def test_duplicate_questions_merge(seeded):
    with tx() as conn:
        a = routing.route_question(conn, question="How do retro pay corrections handle overtime?", team_id="payroll",
                                   asker_person_id="jordan-kim", via_team_id="time")
        b = routing.route_question(conn, question="How are retro pay corrections handled with overtime",
                                   team_id="payroll", asker_person_id="chloe-reyes", via_team_id="time")
        assert b["merged"] and b["id"] == a["id"]
        assert routing.open_count(conn, a["expert_id"]) == 1


def test_timeout_escalates_to_team_lead(seeded):
    with tx() as conn:
        item = routing.route_question(conn, question="Who approves COBRA notice templates?", team_id="benefits",
                                      asker_person_id="jordan-kim", via_team_id="time", topic_id="cobra")
        conn.execute(inbox_items.update().where(inbox_items.c.id == item["id"]).values(
            created_at=now() - timedelta(minutes=settings.timeout_minutes + 1)))
        assert routing.escalate_overdue(conn) == 1
        row = conn.execute(sa.select(inbox_items).where(inbox_items.c.id == item["id"])).first()
    assert row.status == "escalated" and row.escalated_to == "priya-nair"


def test_seeded_expiry_and_conflicts(seeded):
    with tx() as conn:
        statuses = dict(conn.execute(sa.select(knowledge_entries.c.question, knowledge_entries.c.status)).all())
    assert statuses["Can employees edit their own punches after submitting a timesheet?"] == "expired"
    assert statuses["When is unused PTO paid out after an employee leaves?"] == "conflicted"
    assert statuses["What is the timing for paying out unused PTO at termination?"] == "conflicted"
    assert statuses["Is overtime calculated per week or per pay period?"] == "approved"


def test_no_tool_changes_external_systems():
    """Agents only inform: the MCP tool surface is read-only by construction."""
    assert {n for n in dir(agents.TeamAgent) if not n.startswith("_")} == {
        "ask", "capability_card", "whats_in_progress", "assess_impact", "sole_source_topics"}


def test_seeding_never_calls_the_live_llm(monkeypatch):
    """Seeding must work even when the configured LLM fails (e.g. a live key with no model access)."""
    import providers
    from scripts.seed import seed

    class Broken:
        def __getattr__(self, name):
            raise RuntimeError("live LLM called during seeding")

    monkeypatch.setattr(providers, "get_llm", lambda: Broken())
    monkeypatch.setattr("knowledge.get_llm", lambda: Broken())
    seed(verbose=False)
    with tx() as conn:
        statuses = dict(conn.execute(sa.select(knowledge_entries.c.question, knowledge_entries.c.status)).all())
    assert statuses["When is unused PTO paid out after an employee leaves?"] == "conflicted"


def test_failed_live_llm_falls_back_and_is_reported(client, monkeypatch):
    import providers
    from providers.llm_mock import MockLLM
    from tests.conftest import as_

    class Down:
        def __getattr__(self, name):
            def fail(*a, **k):
                raise RuntimeError("model not available")
            return fail

    monkeypatch.setattr(providers, "get_llm", lambda: providers._WithFallback(Down(), MockLLM()))
    monkeypatch.setattr("orchestrator.get_llm", providers.get_llm)
    card = client.post("/ask?stream=false", json={"question": "How does overtime affect benefits eligibility?"},
                       headers=as_("jordan-kim")).json()
    assert card["state"] == "answer"  # answered by the offline fallback
    assert "model not available" in client.get("/health").json()["llm_error"]
    providers.last_llm_error = ""
