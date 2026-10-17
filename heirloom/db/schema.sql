-- Heirloom schema (SPEC §12, plus the M1 additions noted inline).
-- Idempotent: drops and recreates everything. Run via services/api/scripts/seed.py.

create extension if not exists vector;
create extension if not exists pgcrypto;

drop view if exists topic_bus_factor;
drop table if exists
  ask_events, rampup_items, entry_flags, source_topics,
  exit_interviews, contributions, answer_deliveries, topic_knowers,
  impact_checks, insights, agent_calls, inbox_items, knowledge_prs,
  entry_sources, knowledge_entries, chunks, sources, topics, people, teams
  cascade;
drop type if exists share_level, person_role, source_type, entry_type,
  entry_status, pr_status, inbox_status, insight_type, insight_status,
  knower_role, exit_status cascade;

create type share_level   as enum ('team', 'cross_team', 'company');
create type person_role   as enum ('member', 'expert', 'lead');
create type source_type   as enum ('doc', 'meeting', 'voice_note', 'expert_answer');
-- §6 expiry table: regulation 12mo, process 6mo, roster 3mo, decision none.
create type entry_type    as enum ('regulation', 'process', 'roster', 'decision');
create type entry_status  as enum ('draft', 'approved', 'expired', 'conflicted');
create type pr_status     as enum ('open', 'approved', 'rejected');
create type inbox_status  as enum ('pending', 'answered', 'escalated');
create type insight_type  as enum ('overlap', 'reuse', 'conflict');
create type insight_status as enum ('new', 'useful', 'not_relevant');
create type knower_role   as enum ('author', 'answerer', 'cited');
create type exit_status   as enum ('consented', 'in_progress', 'in_review', 'submitted');

create table teams (
  id                  text primary key,            -- 'payroll' | 'benefits' | 'time'
  name                text not null,
  accent_color        text not null,
  capability_card     jsonb not null default '{}',
  default_share_level share_level not null default 'cross_team',
  -- addition: per-team expiry defaults in months, keyed by entry_type (null = no expiry)
  expiry_defaults     jsonb not null default
    '{"regulation": 12, "process": 6, "roster": 3, "decision": null}'
);

create table people (
  id           text primary key,                   -- slug, e.g. 'maria-lopez'
  name         text not null,
  title        text not null,
  team_id      text not null references teams(id),
  role         person_role not null default 'member',
  is_knowledge_owner boolean not null default false,
  is_departing boolean not null default false
);

create table topics (
  id                text primary key,              -- slug, e.g. 'retro-pay-overtime'
  name              text not null,
  team_id           text not null references teams(id),
  co_owner_team_ids text[] not null default '{}'
);

create table sources (
  id           uuid primary key default gen_random_uuid(),
  team_id      text not null references teams(id),
  type         source_type not null,
  title        text not null,
  storage_path text,
  text         text not null,
  -- addition: §14 withholds a document (vendor terms), so sources carry a share level too
  share_level  share_level not null default 'cross_team',
  created_at   timestamptz not null default now()
);

create table chunks (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references sources(id) on delete cascade,
  team_id      text not null references teams(id),
  text         text not null,
  start_offset int not null,                       -- sources.text[start:end] == chunks.text
  end_offset   int not null,
  embedding    vector(1536)                        -- OpenAI text-embedding-3-small
);
create index chunks_team_idx on chunks(team_id);
create index chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);

create table knowledge_entries (
  id          uuid primary key default gen_random_uuid(),
  team_id     text not null references teams(id),
  topic_id    text not null references topics(id),
  question    text not null,
  answer      jsonb not null,
  entry_type  entry_type not null,
  share_level share_level not null,
  status      entry_status not null default 'draft',
  verified_by text references people(id),
  verified_at timestamptz,
  expires_at  timestamptz
);

create table entry_sources (
  entry_id  uuid not null references knowledge_entries(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  quote     text not null,
  primary key (entry_id, source_id, quote)
);

create table knowledge_prs (
  id          serial primary key,                  -- shown as "Knowledge PR #14"
  entry_id    uuid not null references knowledge_entries(id) on delete cascade,
  proposed_by text references people(id),
  reviewer_id text references people(id),
  status      pr_status not null default 'open',
  diff        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create table inbox_items (
  id              uuid primary key default gen_random_uuid(),
  question        text not null,
  asker_person_id text references people(id),
  via_team_id     text references teams(id),
  expert_id       text references people(id),
  topic_id        text references topics(id),
  status          inbox_status not null default 'pending',
  merged_into_id  uuid references inbox_items(id),
  created_at      timestamptz not null default now()
);

create table agent_calls (
  id                uuid primary key default gen_random_uuid(),
  from_team         text not null references teams(id),
  to_team           text not null references teams(id),
  question          text not null,
  hop_chain         text[] not null default '{}',
  shared_source_ids uuid[] not null default '{}',
  withheld          jsonb not null default '[]',
  latency_ms        int,
  created_at        timestamptz not null default now()
);

create table insights (
  id          uuid primary key default gen_random_uuid(),
  type        insight_type not null,
  team_ids    text[] not null,
  description text not null,
  evidence    jsonb not null default '[]',
  confidence  real not null,
  status      insight_status not null default 'new',
  created_at  timestamptz not null default now()
);

create table impact_checks (
  id                 uuid primary key default gen_random_uuid(),
  from_team          text not null references teams(id),
  change_description text not null,
  results            jsonb not null default '[]',
  created_at         timestamptz not null default now()
);

create table topic_knowers (
  topic_id  text not null references topics(id) on delete cascade,
  person_id text not null references people(id),
  role      knower_role not null,
  primary key (topic_id, person_id, role)
);

create table answer_deliveries (
  entry_id     uuid not null references knowledge_entries(id) on delete cascade,
  person_id    text not null references people(id),
  delivered_at timestamptz not null default now()
);

create table contributions (
  person_id    text not null references people(id),
  entry_id     uuid not null references knowledge_entries(id) on delete cascade,
  helped_count int not null default 0,
  primary key (person_id, entry_id)
);

create table exit_interviews (
  id         uuid primary key default gen_random_uuid(),
  person_id  text not null references people(id),
  started_by text not null references people(id),
  consent_at timestamptz not null,                 -- consent is required (§6)
  status     exit_status not null default 'consented',
  topic_ids  text[] not null default '{}'
);

-- Additions not in §12 --------------------------------------------------------

-- Which topics a source covers (bus factor, impact checks, capture sessions).
create table source_topics (
  source_id uuid not null references sources(id) on delete cascade,
  topic_id  text not null references topics(id) on delete cascade,
  primary key (source_id, topic_id)
);

-- "Flag as wrong" (§6 corrections propagate).
create table entry_flags (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references knowledge_entries(id) on delete cascade,
  flagged_by text not null references people(id),
  reason     text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Ramp-up path items and progress (§9.8).
create table rampup_items (
  id        uuid primary key default gen_random_uuid(),
  person_id text not null references people(id),
  day       int not null,
  team_id   text not null references teams(id),
  kind      text not null check (kind in ('topic', 'person', 'gap')),
  title     text not null,
  detail    jsonb not null default '{}',
  done      boolean not null default false
);

-- Every question asked, for "how often asked" on the knowledge map (§9.5).
create table ask_events (
  id         uuid primary key default gen_random_uuid(),
  person_id  text references people(id),
  team_id    text not null references teams(id),
  topic_id   text references topics(id),
  question   text not null,
  created_at timestamptz not null default now()
);

-- Bus factor = COUNT(DISTINCT person_id) in topic_knowers (§12).
create view topic_bus_factor as
select t.id as topic_id, t.team_id,
       count(distinct k.person_id)::int as bus_factor
from topics t
left join topic_knowers k on k.topic_id = t.id
group by t.id, t.team_id;
