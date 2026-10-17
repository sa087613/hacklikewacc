"""Database schema (SPEC §12 plus additions). Portable across Postgres and SQLite.

This is the source of truth; db/schema.sql is generated from it by
scripts/dump_schema.py. Arrays and jsonb are JSON columns (jsonb on Postgres);
enum-like columns are strings validated in code. Embeddings are pgvector on
Postgres and JSON on SQLite (unused offline: search falls back to BM25).
"""
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import JSONB

from config import settings

JSONT = sa.JSON().with_variant(JSONB(), "postgresql")
EMBEDDING = sa.JSON().with_variant(Vector(settings.embedding_dim), "postgresql")


class UTCDateTime(sa.TypeDecorator):
    """Timezone-aware UTC datetimes on both backends (SQLite stores naive)."""

    impl = sa.DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        if value is not None and dialect.name == "sqlite":
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


def now():
    return datetime.now(timezone.utc)


def new_id():
    return str(uuid.uuid4())


metadata = sa.MetaData()


def _id():
    return sa.Column("id", sa.String(36), primary_key=True, default=new_id)


def _fk(name, target, **kw):
    return sa.Column(name, sa.String(64), sa.ForeignKey(target, ondelete=kw.pop("ondelete", None)), **kw)


teams = sa.Table(
    "teams", metadata,
    sa.Column("id", sa.String(64), primary_key=True),
    sa.Column("name", sa.Text, nullable=False),
    sa.Column("accent_color", sa.Text, nullable=False),
    sa.Column("capability_card", JSONT, nullable=False, default=dict),
    sa.Column("default_share_level", sa.String(16), nullable=False, default="cross_team"),
    sa.Column("expiry_defaults", JSONT, nullable=False,
              default=lambda: {"regulation": 12, "process": 6, "roster": 3, "decision": None}),
)

people = sa.Table(
    "people", metadata,
    sa.Column("id", sa.String(64), primary_key=True),
    sa.Column("name", sa.Text, nullable=False),
    sa.Column("title", sa.Text, nullable=False),
    _fk("team_id", "teams.id", nullable=False),
    sa.Column("role", sa.String(16), nullable=False, default="member"),  # member | expert | lead
    sa.Column("is_knowledge_owner", sa.Boolean, nullable=False, default=False),
    sa.Column("is_departing", sa.Boolean, nullable=False, default=False),
)

topics = sa.Table(
    "topics", metadata,
    sa.Column("id", sa.String(64), primary_key=True),
    sa.Column("name", sa.Text, nullable=False),
    _fk("team_id", "teams.id", nullable=False),
    sa.Column("co_owner_team_ids", JSONT, nullable=False, default=list),
)

sources = sa.Table(
    "sources", metadata,
    _id(),
    _fk("team_id", "teams.id", nullable=False),
    sa.Column("type", sa.String(16), nullable=False),  # doc | meeting | voice_note | expert_answer
    sa.Column("title", sa.Text, nullable=False),
    # Short name used in withheld notices ("vendor contract terms"), so the title never leaks detail.
    sa.Column("label", sa.Text),
    sa.Column("storage_path", sa.Text),
    sa.Column("text", sa.Text, nullable=False),
    sa.Column("share_level", sa.String(16), nullable=False, default="cross_team"),
    sa.Column("author_ids", JSONT, nullable=False, default=list),
    sa.Column("created_at", UTCDateTime, nullable=False, default=now),
)

chunks = sa.Table(
    "chunks", metadata,
    _id(),
    sa.Column("source_id", sa.String(36), sa.ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True),
    _fk("team_id", "teams.id", nullable=False, index=True),
    sa.Column("text", sa.Text, nullable=False),
    sa.Column("start_offset", sa.Integer, nullable=False),  # sources.text[start:end] == chunks.text
    sa.Column("end_offset", sa.Integer, nullable=False),
    sa.Column("embedding", EMBEDDING),
)

knowledge_entries = sa.Table(
    "knowledge_entries", metadata,
    _id(),
    _fk("team_id", "teams.id", nullable=False),
    _fk("topic_id", "topics.id"),
    sa.Column("question", sa.Text, nullable=False),
    sa.Column("answer", JSONT, nullable=False),  # {summary, steps[], caveats[]}
    sa.Column("entry_type", sa.String(16), nullable=False),  # regulation | process | roster | decision
    sa.Column("share_level", sa.String(16), nullable=False),
    # draft | approved | expired | conflicted | superseded
    sa.Column("status", sa.String(16), nullable=False, default="draft"),
    _fk("verified_by", "people.id"),
    sa.Column("verified_at", UTCDateTime),
    sa.Column("expires_at", UTCDateTime),
    sa.Column("source_id", sa.String(36), sa.ForeignKey("sources.id")),  # rendered entry text, for citations
    sa.Column("reconfirm_requested_at", UTCDateTime),
    sa.Column("created_at", UTCDateTime, nullable=False, default=now),
)

entry_sources = sa.Table(
    "entry_sources", metadata,
    sa.Column("entry_id", sa.String(36), sa.ForeignKey("knowledge_entries.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("source_id", sa.String(36), sa.ForeignKey("sources.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("quote", sa.Text, primary_key=True),
)

knowledge_prs = sa.Table(
    "knowledge_prs", metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),  # "Knowledge PR #14"
    sa.Column("entry_id", sa.String(36), sa.ForeignKey("knowledge_entries.id", ondelete="CASCADE"), nullable=False),
    _fk("team_id", "teams.id", nullable=False),
    _fk("proposed_by", "people.id"),
    _fk("reviewer_id", "people.id"),
    sa.Column("status", sa.String(16), nullable=False, default="open"),  # open | approved | rejected
    # {question, summary, steps, caveats, entry_type, expiry_months, share_level, origin{kind, transcript, duration_s}}
    sa.Column("diff", JSONT, nullable=False, default=dict),
    sa.Column("inbox_item_id", sa.String(36)),
    sa.Column("exit_interview_id", sa.String(36)),
    sa.Column("created_at", UTCDateTime, nullable=False, default=now),
    sa.Column("decided_at", UTCDateTime),
)

inbox_items = sa.Table(
    "inbox_items", metadata,
    _id(),
    sa.Column("question", sa.Text, nullable=False),
    _fk("asker_person_id", "people.id"),
    _fk("via_team_id", "teams.id"),
    _fk("team_id", "teams.id"),  # the team whose domain the question belongs to
    _fk("expert_id", "people.id"),
    _fk("topic_id", "topics.id"),
    sa.Column("status", sa.String(16), nullable=False, default="pending"),  # pending | answered | escalated
    sa.Column("merged_into_id", sa.String(36), sa.ForeignKey("inbox_items.id")),
    _fk("escalated_to", "people.id"),
    sa.Column("escalated_at", UTCDateTime),
    _fk("overflow_from", "people.id"),  # expert skipped because they were at the open-question cap
    sa.Column("answered_at", UTCDateTime),
    sa.Column("created_at", UTCDateTime, nullable=False, default=now),
)

agent_calls = sa.Table(
    "agent_calls", metadata,
    _id(),
    _fk("from_team", "teams.id", nullable=False),
    _fk("to_team", "teams.id", nullable=False),
    sa.Column("tool", sa.String(32), nullable=False, default="ask"),
    sa.Column("question", sa.Text, nullable=False),
    sa.Column("hop_chain", JSONT, nullable=False, default=list),
    sa.Column("shared_source_ids", JSONT, nullable=False, default=list),
    sa.Column("withheld", JSONT, nullable=False, default=list),
    sa.Column("blocked_reason", sa.Text),
    sa.Column("latency_ms", sa.Integer),
    sa.Column("created_at", UTCDateTime, nullable=False, default=now),
)

insights = sa.Table(
    "insights", metadata,
    _id(),
    sa.Column("type", sa.String(16), nullable=False),  # overlap | reuse | conflict
    sa.Column("team_ids", JSONT, nullable=False),
    sa.Column("title", sa.Text, nullable=False, default=""),
    sa.Column("description", sa.Text, nullable=False),
    sa.Column("evidence", JSONT, nullable=False, default=list),
    sa.Column("suggested_contacts", JSONT, nullable=False, default=list),
    sa.Column("confidence", sa.Float, nullable=False),
    sa.Column("signature", sa.Text, nullable=False),
    sa.Column("status", sa.String(16), nullable=False, default="new"),  # new | useful | not_relevant
    sa.Column("created_at", UTCDateTime, nullable=False, default=now),
)

impact_checks = sa.Table(
    "impact_checks", metadata,
    _id(),
    _fk("from_team", "teams.id", nullable=False),
    _fk("requested_by", "people.id"),
    sa.Column("change_description", sa.Text, nullable=False),
    sa.Column("results", JSONT, nullable=False, default=list),
    sa.Column("created_at", UTCDateTime, nullable=False, default=now),
)

topic_knowers = sa.Table(
    "topic_knowers", metadata,
    sa.Column("topic_id", sa.String(64), sa.ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("person_id", sa.String(64), sa.ForeignKey("people.id"), primary_key=True),
    sa.Column("role", sa.String(16), primary_key=True),  # author | answerer | cited
)

answer_deliveries = sa.Table(
    "answer_deliveries", metadata,
    sa.Column("entry_id", sa.String(36), sa.ForeignKey("knowledge_entries.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("person_id", sa.String(64), sa.ForeignKey("people.id"), primary_key=True),
    sa.Column("answer_id", sa.String(36)),
    sa.Column("delivered_at", UTCDateTime, nullable=False, default=now),
)

contributions = sa.Table(
    "contributions", metadata,
    sa.Column("person_id", sa.String(64), sa.ForeignKey("people.id"), primary_key=True),
    sa.Column("entry_id", sa.String(36), sa.ForeignKey("knowledge_entries.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("helped_count", sa.Integer, nullable=False, default=0),
)

exit_interviews = sa.Table(
    "exit_interviews", metadata,
    _id(),
    _fk("person_id", "people.id", nullable=False),
    _fk("started_by", "people.id", nullable=False),
    sa.Column("consent_at", UTCDateTime, nullable=False),
    # in_progress | in_review | submitted
    sa.Column("status", sa.String(16), nullable=False, default="in_progress"),
    sa.Column("topic_ids", JSONT, nullable=False, default=list),
    sa.Column("topic_state", JSONT, nullable=False, default=dict),  # {topic_id: pending|in_progress|captured|skipped}
    sa.Column("messages", JSONT, nullable=False, default=list),  # [{role, topic_id, text, kind}]
    sa.Column("drafts", JSONT, nullable=False, default=dict),  # {topic_id: draft}
    sa.Column("created_at", UTCDateTime, nullable=False, default=now),
)

# Additions not in §12 ----------------------------------------------------------

source_topics = sa.Table(
    "source_topics", metadata,
    sa.Column("source_id", sa.String(36), sa.ForeignKey("sources.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("topic_id", sa.String(64), sa.ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True),
)

answers = sa.Table(
    "answers", metadata,
    _id(),
    _fk("person_id", "people.id"),
    _fk("agent_team", "teams.id", nullable=False),
    sa.Column("question", sa.Text, nullable=False),
    sa.Column("card", JSONT, nullable=False),
    sa.Column("trace", JSONT, nullable=False, default=list),
    sa.Column("helpful", sa.Boolean),
    sa.Column("created_at", UTCDateTime, nullable=False, default=now),
)

entry_flags = sa.Table(
    "entry_flags", metadata,
    _id(),
    sa.Column("entry_id", sa.String(36), sa.ForeignKey("knowledge_entries.id", ondelete="CASCADE")),
    sa.Column("answer_id", sa.String(36), sa.ForeignKey("answers.id", ondelete="CASCADE")),
    _fk("flagged_by", "people.id", nullable=False),
    sa.Column("reason", sa.Text),
    sa.Column("resolved_at", UTCDateTime),
    sa.Column("created_at", UTCDateTime, nullable=False, default=now),
)

notifications = sa.Table(
    "notifications", metadata,
    _id(),
    _fk("person_id", "people.id", nullable=False, index=True),
    sa.Column("kind", sa.String(32), nullable=False),
    sa.Column("title", sa.Text, nullable=False),
    sa.Column("body", sa.Text, nullable=False, default=""),
    sa.Column("link", sa.Text),
    sa.Column("read_at", UTCDateTime),
    sa.Column("created_at", UTCDateTime, nullable=False, default=now),
)

rampup_items = sa.Table(
    "rampup_items", metadata,
    _id(),
    _fk("person_id", "people.id", nullable=False),
    sa.Column("day", sa.Integer, nullable=False),
    _fk("team_id", "teams.id", nullable=False),
    sa.Column("kind", sa.String(16), nullable=False),  # topic | person | gap
    sa.Column("title", sa.Text, nullable=False),
    sa.Column("detail", JSONT, nullable=False, default=dict),
    sa.Column("done", sa.Boolean, nullable=False, default=False),
    sa.Column("created_at", UTCDateTime, nullable=False, default=now),
)

ask_events = sa.Table(
    "ask_events", metadata,
    _id(),
    _fk("person_id", "people.id"),
    _fk("team_id", "teams.id", nullable=False),
    _fk("topic_id", "topics.id"),
    sa.Column("question", sa.Text, nullable=False),
    sa.Column("created_at", UTCDateTime, nullable=False, default=now),
)
