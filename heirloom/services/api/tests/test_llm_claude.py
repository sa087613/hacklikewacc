"""The live Claude provider, exercised without network: every method builds a valid request and parses a reply."""
import json
from types import SimpleNamespace

import pytest

from providers import llm_claude


def _schema_ok(schema):
    """Strict structured outputs need required + additionalProperties false on every object."""
    if schema.get("type") == "object":
        assert schema["additionalProperties"] is False
        assert set(schema["required"]) == set(schema["properties"])
        for v in schema["properties"].values():
            _schema_ok(v)
    if schema.get("type") == "array":
        _schema_ok(schema["items"])


@pytest.mark.parametrize("name", ["ANSWER_SCHEMA", "ROUTE_SCHEMA", "STRUCTURE_SCHEMA", "STANDUP_SCHEMA", "IMPACT_SCHEMA",
                                  "EXIT_SCHEMA", "CONFLICT_SCHEMA"])
def test_schemas_are_strict(name):
    _schema_ok(getattr(llm_claude, name))


def test_every_method_round_trips(monkeypatch):
    replies = {
        "ROUTE": {"teams": ["benefits", "nowhere"]},
        "ANSWER": {"lead": "x", "points": [], "gaps": []},
        "STRUCTURE": {"question": "q", "summary": "s", "steps": [], "caveats": [], "entry_type": "process"},
        "STANDUP": {"insights": []},
        "IMPACT": {"no_impact": True, "summary": "", "concerns": [], "affected_areas": []},
        "EXIT": {"done": True, "question": ""},
        "CONFLICT": {"conflict": False, "reason": ""},
    }
    calls = []

    def create(**kw):
        calls.append(kw)
        schema = kw["output_config"]["format"]["schema"]
        key = next(k for k in replies if getattr(llm_claude, f"{k}_SCHEMA") is schema)
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=json.dumps(replies[key]))])

    llm = llm_claude.ClaudeLLM.__new__(llm_claude.ClaudeLLM)
    llm.client = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(create=create)))
    assert llm.route("q", "time", {"benefits": {}, "payroll": {}}) == ["benefits"]  # unknown teams dropped
    assert llm.compose_answer("q", "time", "Time", [], {})["lead"] == "x"
    assert llm.structure_answer("q", "t", "Maria")["entry_type"] == "process"
    assert llm.standup({}) == []
    assert llm.assess_impact("payroll", "Payroll", "c", "time", [])["no_impact"] is True
    assert llm.exit_question({"id": "t", "name": "T"}, "Maria", [])["done"] is True
    assert llm.detect_conflict({}, {})["conflict"] is False
    assert all(c["model"] and c["max_tokens"] and c["system"] for c in calls)


def test_refusal_raises(monkeypatch):
    llm = llm_claude.ClaudeLLM.__new__(llm_claude.ClaudeLLM)
    llm.client = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(
        create=lambda **kw: SimpleNamespace(stop_reason="refusal", content=[]))))
    with pytest.raises(RuntimeError, match="declined"):
        llm.detect_conflict({}, {})
