"""Run the API the way Vercel Services does, in a fresh process with VERCEL=1:
in-process agents (even if AGENT_TRANSPORT=mcp), seed loaded into memory, routes under /api,
and nothing written to disk."""
import json
import os
import subprocess
import sys
from pathlib import Path

API = Path(__file__).resolve().parents[1]

SCRIPT = r"""
import json, sys, types
# Any MCP subprocess call fails the test.
trap = types.ModuleType("mcp_transport")
def _boom(*a, **k): raise AssertionError("MCP transport used on Vercel")
trap.call_tool = _boom
sys.modules["mcp_transport"] = trap

import main
from config import settings
from fastapi.testclient import TestClient

out = {"providers": settings.provider_status()}
c = TestClient(main.app)  # no lifespan: a cold start; the first request seeds
out["health"] = c.get("/api/health").json()
out["root_health"] = c.get("/health").status_code
r = c.post("/api/ask?stream=false", json={"question": "How does overtime affect benefits eligibility?"},
           headers={"X-Person-Id": "jordan-kim"})
out["ask"] = {"status": r.status_code, "consulted": r.json().get("consulted_teams")}
up = c.post("/api/sources/upload", headers={"X-Person-Id": "ana-torres"}, data={"team_id": "payroll"},
            files={"file": ("note.md", b"# Note\n\nOvertime approvals close at 5pm.", "text/markdown")})
out["upload"] = up.json().get("storage_path")
print("RESULT " + json.dumps(out))
"""


def test_vercel_mode(tmp_path):
    env = {k: v for k, v in os.environ.items() if k not in ("DATA_DIR", "HEIRLOOM_TEST_DATABASE_URL")}
    data_dir = tmp_path / "data"
    env.update(VERCEL="1", AGENT_TRANSPORT="mcp", HEIRLOOM_OFFLINE="1", DATA_DIR=str(data_dir))
    before = set(API.rglob("*"))
    proc = subprocess.run([sys.executable, "-c", SCRIPT], cwd=API, env=env, capture_output=True, text=True, timeout=120)
    assert proc.returncode == 0, proc.stderr[-2000:]
    out = json.loads(proc.stdout.split("RESULT ", 1)[1])

    assert out["providers"]["agents"] == "inprocess"
    assert out["providers"]["database"] == "sqlite" and out["providers"]["storage"] == "memory"
    assert out["health"]["counts"]["sources"] == 27  # seed loaded at startup, from memory
    assert out["root_health"] == 404  # served under /api only
    assert out["ask"] == {"status": 200, "consulted": ["benefits", "payroll"]}
    assert out["upload"] == "memory:" + out["upload"].split(":", 1)[1]

    assert not data_dir.exists()  # no SQLite file, no uploads
    new_files = {p for p in set(API.rglob("*")) - before if "__pycache__" not in p.parts and ".pytest_cache" not in p.parts}
    assert not new_files, f"wrote to disk: {sorted(map(str, new_files))[:5]}"
