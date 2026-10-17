# Heirloom build progress

Resume here after a `/clear`. Spec: [docs/SPEC.md](docs/SPEC.md). Rules: [../CLAUDE.md](../CLAUDE.md).
Build order (user's priority): 2 → 3 → 4 → 7 → 6 → 5 → 9 → 8.

## Status

| # | Milestone | State |
| --- | --- | --- |
| 1 | Foundation | Done (commit 6eaf764) |
| 2 | Single-agent answers | Done: Ask page, §7 answer card, source side panel at exact passage, trace panel, citation verifier + fabricated-quote tests |
| 3 | Agent-to-agent | Done: MCP servers per team (verified end to end with `AGENT_TRANSPORT=mcp`), hop/loop rules, share policy + withheld notices, Network screen with live edges, edge → exchange panel, audit log |
| 4 | Learning loop | Backend done |
| 7 | Insights | Backend done |
| 6 | Bus factor map + exit interview | Backend done |
| 5 | Trust features | Backend done |
| 9 | Polish + rehearse | Not started |
| 8 | Ramp-up + credit | Backend done |

## Architecture decisions (made without asking; change if needed)

- **Provider layer** (`services/api/providers/`, `store/db.py`, `config.py`): each external service has a live and an offline implementation, picked from env vars. Template placeholders (`YOUR-…`, `REGION`) count as missing. `HEIRLOOM_OFFLINE=1` forces everything offline (tests do this).
  | Provider | Live (needs) | Offline default |
  | --- | --- | --- |
  | database | Postgres + pgvector (`DATABASE_URL`) | SQLite at `heirloom/.data/heirloom.db` |
  | embeddings | OpenAI `text-embedding-3-small` (`OPENAI_API_KEY`) | none: BM25 keyword search |
  | llm | Claude `claude-opus-5-5` (`ANTHROPIC_API_KEY`) | scripted mock (`providers/llm_mock.py`) |
  | transcription | Whisper (`OPENAI_API_KEY`) | typed transcript required |
  | storage | Supabase Storage (`SUPABASE_URL` + `SUPABASE_SERVICE_KEY`) | local disk `heirloom/.data/uploads` |
- **Schema source of truth** is now `services/api/store/schema.py` (SQLAlchemy, portable). Arrays/jsonb are JSON columns; enum-like fields are strings validated in code. `db/schema.sql` is the M1 hand-written version, superseded.
- **Mock LLM never writes facts**: answers/insights/impact concerns are exact sentence spans from the evidence it is given, so the citation verifier runs on mock output too. Scripted parts (standup insights, rounding impact, exit-interview questions) are guarded by `tests/test_mock_scripts.py`.
- **Certainty is labeled in code** (`orchestrator.build_card`): a citation is `expert_verified` only if it falls inside an approved entry's backing quote/source. The model's label is ignored.
- **Agent transport**: in-process by default; `AGENT_TRANSPORT=mcp` runs each call through a per-team MCP stdio server (`services/team-agent/server.py`, mcp 2.3). Same `TeamAgent` code either way.
- **Identity**: `X-Person-Id` header from the top-bar user switcher (§20: no real auth). Lead-only screens check `role == lead or is_knowledge_owner`.
- **Python 3.12** (Homebrew) for the API venv; system Python 3.9 is too old for mcp/anthropic 1.x.
- Seed vendor doc got a `label` ("vendor contract terms") and a retro-pay section so the §15 withheld notice is relevant and leaks no detail.

## Never run against live services

Written fully, never exercised (no keys yet): `providers/llm_claude.py`, `providers/embeddings.py:OpenAIEmbeddings`, `providers/transcribe.py:WhisperTranscriber`, `providers/storage.py:SupabaseStorage`, the Postgres path of `store/db.py` and the pgvector branch of `search.py`.

## Rough edges

- Mock answers are sentence extraction: correct and cited, but sometimes terse or quoting a chat note verbatim. Claude composes real prose once `ANTHROPIC_API_KEY` is set.
- Web runs on port **3100** (port 3000 was taken on this machine).
- Offline agent calls take ~1 ms, so the Network screen holds each edge lit for 1.8 s to make it visible.
- MCP transport launches one stdio subprocess per call (~0.6 s each); fine for a demo, not tuned.

## Next

M4 frontend: Inbox (questions for me with text/voice-transcript answers, knowledge PR review with edit/approve/reject).
