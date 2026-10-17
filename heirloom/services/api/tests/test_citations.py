"""Citation verification must stop fabricated quotes, whatever the LLM returns."""
import sqlalchemy as sa

import citations
import orchestrator
from store.db import tx
from store.schema import people, sources

REAL = "Overtime is calculated weekly."
FAKE = "Overtime is averaged across the biweekly pay period."  # sounds plausible; appears nowhere


def _src(conn, title):
    return conn.execute(sa.select(sources.c.id).where(sources.c.title == title)).scalar()


def test_fabricated_quote_is_dropped(seeded):
    with tx() as conn:
        sid = _src(conn, "Overtime Policy")
        ok, dropped = citations.verify_citations(conn, [{"source_id": sid, "quote": REAL},
                                                        {"source_id": sid, "quote": FAKE}], {sid})
    assert [c["quote"] for c in ok] == [REAL]
    assert dropped[0]["reason"] == "quote not found in source"


def test_real_quote_gets_exact_offsets(seeded):
    with tx() as conn:
        sid = _src(conn, "Overtime Policy")
        ok, _ = citations.verify_citations(conn, [{"source_id": sid, "quote": REAL}], {sid})
        text = conn.execute(sa.select(sources.c.text).where(sources.c.id == sid)).scalar()
    assert text[ok[0]["start"]:ok[0]["end"]] == REAL


def test_quote_from_source_outside_evidence_is_dropped(seeded):
    """A real quote from a withheld (or un-retrieved) source still can't be cited."""
    with tx() as conn:
        vendor = _src(conn, "Benefits vendor contract terms (Bellwether Health Administrators)")
        ok, dropped = citations.verify_citations(
            conn, [{"source_id": vendor, "quote": "Three-year agreement, renewing January 2027."}], allowed_source_ids=set())
    assert ok == [] and dropped[0]["reason"] == "source not in permitted evidence"


def test_fabricated_answer_never_reaches_the_card(seeded, monkeypatch):
    """End to end: if the LLM fabricates every quote, the card says 'no documented answer' and routes to an expert."""
    from providers import get_llm

    llm = get_llm()

    def fake_compose(question, agent_team, team_name, evidence, cards):
        sid = evidence[0]["source_id"]
        return {"lead": "Overtime is averaged biweekly.", "gaps": [],
                "points": [{"text": "Overtime is averaged biweekly.", "certainty": "expert_verified",
                            "citations": [{"source_id": sid, "quote": FAKE}]}]}

    monkeypatch.setattr(llm, "compose_answer", fake_compose)
    card = orchestrator.answer_question("ana-torres", "Is overtime calculated weekly or biweekly?")
    quotes = [c["quote"] for p in card["points"] for c in p["citations"]]
    assert FAKE not in quotes
    assert card["state"] == "no_answer"
    assert card["lead"] != "Overtime is averaged biweekly."
    assert card["verification"]["dropped_citations"] == 1
    assert card["pending_expert"] is not None


def test_certainty_is_labeled_in_code_not_by_the_model(seeded, monkeypatch):
    """A model claiming 'expert_verified' for a plain doc sentence is relabeled 'documented'."""
    from providers import get_llm

    llm = get_llm()

    def compose(question, agent_team, team_name, evidence, cards):
        ev = next(e for e in evidence if "Workweek" in e["text"] or "workweek" in e["text"])
        quote = "Each workweek stands alone"
        return {"lead": "Each workweek stands alone.", "gaps": [],
                "points": [{"text": "Each workweek stands alone.", "certainty": "expert_verified",
                            "citations": [{"source_id": ev["source_id"], "quote": quote}]}]}

    monkeypatch.setattr(llm, "compose_answer", compose)
    card = orchestrator.answer_question("ana-torres", "Does each workweek stand alone for overtime?")
    assert card["points"][0]["certainty"] == "documented"
