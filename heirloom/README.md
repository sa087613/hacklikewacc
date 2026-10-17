# Heirloom

Knowledge worth passing down. Every team gets an AI Keeper, so what people know outlives the time they spend on a team.
Full spec: [docs/SPEC.md](docs/SPEC.md). Build log and decisions: [PROGRESS.md](PROGRESS.md).

Heirloom runs end to end with **no credentials**. Each external service has a live provider and an offline one, and the app picks the live one only when its keys are in `.env`. A "Demo mode: offline" badge in the top bar shows when any offline provider is active.

## Start (offline, one command)

Requires Python 3.10+ (3.12 recommended) and Node 20+.

```bash
./scripts/dev.sh            # creates the venv, installs deps, starts API :8000 and web :3100
./scripts/dev.sh --reset    # same, but reseeds the demo data first
```

Open http://localhost:3100. The first start seeds the SQLite database automatically. To reset during a rehearsal, use **Reset demo data** in the user menu.

Manual start, if you prefer:

```bash
cd services/api
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/seed.py               # offline: SQLite at heirloom/.data/heirloom.db
.venv/bin/uvicorn main:app --port 8000

cd apps/web && npm install && npm run dev      # http://localhost:3100
```

## Going live: env vars per provider

Add keys to `heirloom/.env`, then restart the API. Each provider switches on its own.

| Provider | Offline default | Live | Env vars to add |
| --- | --- | --- | --- |
| Database | SQLite (`.data/heirloom.db`) | Supabase Postgres + pgvector | `DATABASE_URL` (Supabase **Connect** → Session pooler URI, password filled in) |
| Embeddings | BM25 keyword search | OpenAI `text-embedding-3-small` (1536-d) + hybrid search | `OPENAI_API_KEY` |
| LLM | Scripted mock (answers built from exact seed-document sentences) | Claude `claude-opus-5-5` | `ANTHROPIC_API_KEY` (optional: `ANTHROPIC_MODEL`) |
| Voice transcription | Typed transcript required | Whisper | `OPENAI_API_KEY` |
| File storage | Local disk (`.data/uploads`) | Supabase Storage | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |

After switching the database or embeddings provider, reseed: `cd services/api && .venv/bin/python scripts/seed.py` (it creates tables and embeds every chunk). `SUPABASE_ANON_KEY` is not used by the server. Set `HEIRLOOM_OFFLINE=1` to force every provider offline, which the tests do.

Agents talk in-process by default. Set `AGENT_TRANSPORT=mcp` to run every agent call through a per-team MCP server over stdio (`services/team-agent/server.py`, one per `TEAM_ID`).

## Demo script (§15)

Use the user menu (top right) to switch people. Demo mode shortens expert timeouts to 2 minutes.

| Beat | Who | Do |
| --- | --- | --- |
| The risk | Ana Torres | Knowledge → click the red **Retro pay corrections with overtime** tile |
| The capture | Ana Torres → Maria Lopez | Check consent → **Start exit interview** → answer with **Voice note → Use sample: Maria: retro** → answer the follow-up → **Skip** tax withholding → **Switch to Maria to review** → **Submit** |
| | Ana Torres | Inbox → Knowledge PRs → **Approve**. The topic turns amber. |
| The payoff | Jordan Kim | Network → ask "How do retro pay corrections handle overtime, and does it affect benefits eligibility?" |
| The gap | Jordan Kim | Ask "Does a retro pay correction trigger a benefits eligibility re-check?" → routed to Marcus |
| | Marcus Hill → Priya Nair | Inbox → **Answer** → **Record voice note → Use sample: Marcus** → Submit; then as Priya, **Approve** |
| | Jordan Kim | Ask the same question again: an instant, verified answer |
| The wow | Sam Okafor | Insights → **Run standup now**; impact check: "Round overtime to the nearest 15 minutes instead of 6." |

## Tests

```bash
cd services/api && .venv/bin/python -m pytest -q tests    # offline; includes the fabricated-quote test
cd apps/web && npx tsc --noEmit && npm run build
```

## Layout

```
apps/web/                 Next.js app (Tailwind theme from SPEC §18)
services/api/             FastAPI orchestrator
  config.py               settings + provider selection
  providers/              embeddings, LLM (Claude / mock), transcription, storage
  store/                  SQLAlchemy schema (source of truth) + database provider
  orchestrator.py         answer flow: search → route → ask_agent → compose → verify → route gaps
  agents.py               TeamAgent (the 5 MCP tools) + hop/loop rules + call logging
  citations.py            verbatim quote verification
  routing.py              expert selection, caps, dedupe, escalation
  knowledge.py            PRs, corrections, expiry, conflicts
  standup.py impact.py exit_interview.py busfactor.py rampup.py
services/team-agent/      MCP server, run once per TEAM_ID
db/schema.sql             generated from store/schema.py (scripts/dump_schema.py)
db/seed/                  fictional teams, people, topics, entries, 27 docs
```

All seed data is fictional. No real company data, people, or employee records.
