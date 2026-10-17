"""Team agent prompts live with the orchestrator's LLM provider; re-exported here for reference."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from prompts import IMPACT_SYSTEM, TEAM_AGENT_SYSTEM  # noqa: E402,F401
