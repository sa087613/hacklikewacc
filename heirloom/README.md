# Heirloom

Knowledge worth passing down. Every team gets an AI Keeper. Full spec: [docs/SPEC.md](docs/SPEC.md).

Status: **Milestone 1 (Foundation)**: schema, fictional seed data, ingestion with embeddings, app shell.

## Layout

```
apps/web/          Next.js app shell (Tailwind theme from SPEC §18)
services/api/      FastAPI orchestrator: ingestion, seed script, /health, /teams, /people, /sources/upload
db/schema.sql      Postgres + pgvector schema (SPEC §12 plus additions, noted inline)
db/seed/           Fictional teams, people, topics, knowledge entries, and 27 docs
```

## Setup

Requires Python 3.10+ (tested on 3.12), Node 20+, a hosted Supabase project, and an OpenAI key.

### 1. Environment

```bash
cp .env.example .env
```

Fill in `.env` from the Supabase dashboard:

| Variable | Where to find it |
| --- | --- |
| `SUPABASE_URL` | Project Settings → Data API → **Project URL** (`https://<ref>.supabase.co`) |
| `SUPABASE_ANON_KEY` | Project Settings → API Keys → Legacy API keys → **anon** `public` |
| `SUPABASE_SERVICE_KEY` | Project Settings → API Keys → Legacy API keys → **service_role** `secret` (server only, never in the web app) |
| `DATABASE_URL` | **Connect** button (top bar) → Connection string → Method: **Session pooler** → URI. Replace `[YOUR-PASSWORD]` with your database password (Project Settings → Database → Reset password if you don't have it). |
| `OPENAI_API_KEY` | platform.openai.com → API keys |

Use the Session pooler, not "Direct connection": the direct host is IPv6-only on most networks.

### 2. Backend and seed

```bash
cd services/api
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/seed.py          # drops and recreates all tables, then loads seed data
pytest -q tests                 # offline: chunk offsets, personal-data screening, seed docs
uvicorn main:app --reload --port 8000
```

`GET http://localhost:8000/health` returns row counts.

### 3. Web

```bash
cd apps/web
npm install
npm run dev                     # http://localhost:3000
```

The web app calls the API at `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`). Use the user menu in the top bar to switch demo users.

## Seed data

All fictional. No real company data or real people. Planted demo scenarios (SPEC §14):

| Scenario | Where |
| --- | --- |
| Sole-source retro pay (only Maria) | `payroll/retro-pay-chat-notes.md`; no guide section; one knower |
| Overlap: eligibility logic | `payroll/sprint-42-plan.md` ↔ `benefits/eligibility-service-design.md` |
| Reuse: overtime calculator | `time/overtime-calculator-design.md` ↔ `payroll/roadmap.md` |
| Conflict: weekly vs. biweekly hours | `payroll/overtime-policy.md` ↔ `benefits/eligibility-rules.md` |
| Withheld item | `benefits/vendor-contract-terms.md` (share level `team`) |
| Expired entry | Time entry on punch edits, verified 8 months ago |
| Conflicting experts | Two approved Payroll PTO-payout entries |

Also planted: the 6-to-15-minute rounding change (`time/rounding-rules.md`) for the impact check, and an open question on retro pay vs. eligibility re-checks (`benefits/benefits-meeting-notes.md`) for the routed-gap beat.
