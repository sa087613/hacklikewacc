"""MCP transport: each call launches the team's MCP server over stdio and calls one tool.

Used when AGENT_TRANSPORT=mcp. The default in-process transport runs the same
TeamAgent code without subprocesses.
"""
import asyncio
import json
import os
import sys
from typing import Any, Dict

from mcp import Client
from mcp.client.stdio import StdioServerParameters

from config import ROOT

SERVER = ROOT / "services" / "team-agent" / "server.py"


def call_tool(team_id: str, tool: str, args: Dict[str, Any]):
    async def run():
        params = StdioServerParameters(command=sys.executable, args=[str(SERVER)],
                                       env={**os.environ, "TEAM_ID": team_id, "AGENT_TRANSPORT": "inprocess"})
        async with Client(params) as client:
            result = await client.call_tool(tool, args)
            if result.is_error:
                raise RuntimeError(f"{team_id}.{tool} failed: {result.content[0].text if result.content else ''}")
            return json.loads(result.content[0].text)

    return asyncio.run(run())
