"""Team agent MCP server. Same code for every team; run once per TEAM_ID.

    TEAM_ID=payroll python services/team-agent/server.py
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from mcp.server.mcpserver import MCPServer  # noqa: E402

from tools import register  # noqa: E402

TEAM_ID = os.environ.get("TEAM_ID")
if not TEAM_ID:
    sys.exit("Set TEAM_ID (payroll, benefits, or time).")

server = MCPServer(f"{TEAM_ID}-keeper", instructions=f"Heirloom team agent for {TEAM_ID}.")
register(server, TEAM_ID)

if __name__ == "__main__":
    server.run("stdio")
