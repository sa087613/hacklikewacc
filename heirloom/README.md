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

## Deploy to Vercel (Services)

One Vercel project serves both apps on one domain (`heirloom/vercel.json`): the Next.js site at `/` and the FastAPI backend at `/api`.

1. New Project → import the repo → **Root Directory: `heirloom`**. Vercel reads the `services` in `vercel.json`. If it asks for a Framework Preset, choose **Services**.
2. Add the environment variables below, then deploy.
3. Check `https://<project>.vercel.app/api/health`.

On Vercel the API never writes to disk and never starts subprocesses:
- Agents always run in-process (any `AGENT_TRANSPORT=mcp` is ignored). MCP mode still works locally.
- Seed data ships inside the API (`services/api/seed_bundle.json`, built from `db/seed` by `scripts/build_seed_bundle.py`) and loads into memory on the first request.
- Without `DATABASE_URL` the database is in-memory SQLite, per instance: data resets when an instance recycles, and parallel instances don't share state. Add `DATABASE_URL` (Neon from the Storage tab) for data that persists and is shared.
- Uploads are kept in memory unless Supabase Storage is configured.

| Variable | Needed? | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Recommended | Claude writes answers. Without it, the scripted offline mock answers. |
| `DATABASE_URL` | Recommended | Postgres (e.g. Neon via Storage, which sets it for you). Without it: in-memory SQLite per instance. |
| `OPENAI_API_KEY` | Optional | Embeddings for search and Whisper for voice notes. Without it: keyword search, typed transcripts. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Optional | Keep uploaded files in Supabase Storage. Without them: in memory. |
| `ANTHROPIC_MODEL` | Optional | Defaults to `claude-opus-5-5`. |
| `DEMO_MODE` | Optional | Defaults to `true` (2-minute expert timeouts, "Run standup now", demo reset). |

Not needed on Vercel: `NEXT_PUBLIC_API_URL` (defaults to `/api` on the same domain), `WEB_ORIGIN` (same origin, so no CORS), `AGENT_TRANSPORT` (ignored), `SUPABASE_ANON_KEY` (unused). `VERCEL` is set by Vercel itself.

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
