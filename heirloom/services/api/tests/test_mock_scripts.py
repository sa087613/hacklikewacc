"""Scripted mock quotes must exist verbatim in the seed docs, or the demo silently degrades."""
from config import ROOT
from ingest import parse_file
from providers.llm_mock import MockLLM
from routes.system import SAMPLES

DOCS = {p.name: parse_file(p.name, p.read_bytes())[0] for p in (ROOT / "db" / "seed" / "docs").glob("*/*.md")}


def _exists(quote):
    return any(quote in t for t in DOCS.values())


def test_standup_quotes_exist():
    for ins in MockLLM.STANDUP_SCRIPT:
        for _, quote in ins["evidence"]:
            assert _exists(quote), quote


def test_impact_quotes_exist():
    for teams in MockLLM.IMPACT_SCRIPT.values():
        for script in teams.values():
            for _, quotes in script["concerns"]:
                for q in quotes:
                    assert _exists(q), q


def test_samples_are_personal_data_free():
    from ingest import check_personal_data

    for s in SAMPLES.values():
        check_personal_data(s["text"], {})
