"""Live LLM provider: Claude API with structured JSON outputs.

Every method returns the same shapes as providers/llm_mock.py. Citations in the
returned JSON are untrusted until citations.py verifies them.
"""
import json
from typing import Dict, List

import anthropic

import prompts
from config import settings


def _obj(props: Dict, required=None) -> Dict:
    return {"type": "object", "properties": props, "required": required or list(props), "additionalProperties": False}


_STR = {"type": "string"}
_STRS = {"type": "array", "items": _STR}
_CITATIONS = {"type": "array", "items": _obj({"source_id": _STR, "quote": _STR})}

ANSWER_SCHEMA = _obj({
    "lead": _STR,
    "points": {"type": "array", "items": _obj({
        "text": _STR,
        "certainty": {"type": "string", "enum": ["documented", "expert_verified", "no_documented_answer"]},
        "citations": _CITATIONS,
    })},
    "gaps": {"type": "array", "items": _obj({"team": _STR, "question": _STR})},
})
ROUTE_SCHEMA = _obj({"teams": _STRS})
STRUCTURE_SCHEMA = _obj({
    "question": _STR, "summary": _STR, "steps": _STRS, "caveats": _STRS,
    "entry_type": {"type": "string", "enum": ["regulation", "process", "roster", "decision"]},
})
STANDUP_SCHEMA = _obj({"insights": {"type": "array", "items": _obj({
    "type": {"type": "string", "enum": ["overlap", "reuse", "conflict"]},
    "teams": _STRS, "title": _STR, "description": _STR,
    "evidence": {"type": "array", "items": _obj({"team": _STR, "source_id": _STR, "quote": _STR})},
    "confidence": {"type": "number"},
    "suggested_contacts": _STRS,
})}})
IMPACT_SCHEMA = _obj({
    "no_impact": {"type": "boolean"},
    "summary": _STR,
    "concerns": {"type": "array", "items": _obj({"text": _STR, "citations": _CITATIONS})},
    "affected_areas": _STRS,
})
EXIT_SCHEMA = _obj({"done": {"type": "boolean"}, "question": _STR})
CONFLICT_SCHEMA = _obj({"conflict": {"type": "boolean"}, "reason": _STR})


class ClaudeLLM:
    name = "claude"
    live = True

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    def _call(self, system: str, payload: Dict, schema: Dict, effort: str = "medium") -> Dict:
        response = self.client.beta.messages.create(
            model=settings.anthropic_model,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=system,
            messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
            output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
        )
        if response.stop_reason == "refusal":
            raise RuntimeError("The model declined this request.")
        if response.stop_reason == "max_tokens":
            raise RuntimeError("The model ran out of output tokens.")
        text = next(b.text for b in response.content if b.type == "text")
        return json.loads(text)

    def route(self, question: str, asking_team: str, cards: Dict[str, Dict]) -> List[str]:
        out = self._call(prompts.ROUTE_SYSTEM, {"question": question, "asking_team": asking_team, "capability_cards": cards},
                         ROUTE_SCHEMA, effort="low")
        return [t for t in out["teams"] if t in cards]

    def compose_answer(self, question, agent_team, team_name, evidence, cards) -> Dict:
        payload = {"question": question, "capability_cards": cards, "evidence": evidence}
        return self._call(prompts.TEAM_AGENT_SYSTEM.format(team_name=team_name), payload, ANSWER_SCHEMA)

    def structure_answer(self, question: str, transcript: str, expert_name: str) -> Dict:
        return self._call(prompts.STRUCTURE_SYSTEM,
                          {"question": question, "expert": expert_name, "transcript": transcript}, STRUCTURE_SCHEMA)

    def standup(self, progress: Dict[str, Dict]) -> List[Dict]:
        return self._call(prompts.STANDUP_SYSTEM, {"teams": progress}, STANDUP_SCHEMA, effort="high")["insights"]

    def assess_impact(self, team_id, team_name, change, from_team, evidence) -> Dict:
        payload = {"change_description": change, "proposed_by_team": from_team, "evidence": evidence}
        return self._call(prompts.IMPACT_SYSTEM.format(team_name=team_name), payload, IMPACT_SCHEMA)

    def exit_question(self, topic: Dict, person_name: str, history: List[Dict]) -> Dict:
        payload = {"topic": topic, "person": person_name, "conversation_so_far": history}
        return self._call(prompts.EXIT_SYSTEM, payload, EXIT_SCHEMA, effort="low")

    def detect_conflict(self, a: Dict, b: Dict) -> Dict:
        return self._call(prompts.CONFLICT_SYSTEM, {"entry_a": a, "entry_b": b}, CONFLICT_SCHEMA, effort="low")
