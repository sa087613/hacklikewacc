"""The five MCP tools every team agent exposes (SPEC §11.2). Agents only inform: no tool changes external systems."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from agents import TeamAgent  # noqa: E402


def register(server, team_id: str) -> None:
    agent = TeamAgent(team_id)

    def out(obj) -> str:
        return json.dumps(obj, default=str)

    @server.tool(description=f"Ask {agent.name} a question. Applies the share policy for asker_team and returns "
                             "original sources, certainty context, and withheld items.")
    def ask(question: str, asker_team: str, hop_chain: list[str]) -> str:
        return out(agent.ask(question, asker_team, hop_chain))

    @server.tool(description="What this team owns and whom to contact. Used for routing.")
    def capability_card() -> str:
        return out(agent.capability_card())

    @server.tool(description="Current projects, plans, and key rules from shareable team docs. Used in standups.")
    def whats_in_progress() -> str:
        return out(agent.whats_in_progress())

    @server.tool(description="Assess a proposed change from this team's perspective, with sources.")
    def assess_impact(change_description: str, from_team: str) -> str:
        return out(agent.assess_impact(change_description, from_team))

    @server.tool(description="Topics where this person is the only source. Used in exit interviews.")
    def sole_source_topics(person_id: str) -> str:
        return out(agent.sole_source_topics(person_id))
