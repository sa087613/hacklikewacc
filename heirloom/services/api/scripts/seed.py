"""Reset the database and load all seed data (SPEC §14). Works offline (SQLite) with no keys.

Usage (from services/api):  python scripts/seed.py
"""
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import policy  # noqa: E402
from config import settings  # noqa: E402
from ingest import ingest_source, parse_file  # noqa: E402
from knowledge import detect_conflicts, expiry_sweep  # noqa: E402
from providers.llm_mock import MockLLM  # noqa: E402
from store import db  # noqa: E402
from store.schema import (contributions, entry_sources, knowledge_entries, new_id, people, teams,  # noqa: E402
                          topic_knowers, topics)

# Seed data is read once into memory from the bundle shipped with the API (built from db/seed by
# scripts/build_seed_bundle.py), so seeding needs no files beyond the deployed service.
BUNDLE = json.loads((Path(__file__).resolve().parents[1] / "seed_bundle.json").read_text())


def load(name):
    return BUNDLE[name.removesuffix(".json")]


def seed(verbose: bool = True) -> dict:
    log = print if verbose else (lambda *a, **k: None)
    status = settings.provider_status()
    log(f"Providers: {status}")
    db.create_all(drop=True)

    with db.tx() as conn:
        for t in load("teams.json"):
            conn.execute(teams.insert().values(
                id=t["id"], name=t["name"], accent_color=t["accent_color"], capability_card=t["capability_card"],
                default_share_level=t["default_share_level"], expiry_defaults=dict(policy.DEFAULT_EXPIRY_MONTHS)))
        conn.execute(people.insert(), load("people.json"))
        conn.execute(topics.insert(), load("topics.json"))
        conn.execute(topic_knowers.insert(), load("topic_knowers.json"))

        doc_ids, texts = {}, {}
        for rel, raw in sorted(BUNDLE["docs"].items()):
            team_id, filename = rel.split("/")
            text, meta = parse_file(filename, raw.encode("utf-8"))
            result = ingest_source(
                conn, team_id=team_id, title=meta["title"], text=text, source_type=meta.get("type", "doc"),
                share_level=meta.get("share_level"), storage_path=f"db/seed/docs/{rel}",
                topic_ids=meta.get("topics", []), meta=meta, label=meta.get("label"), author_ids=meta.get("authors", []),
            )
            doc_ids[rel], texts[rel] = result.source_id, text
            log(f"  ingested {rel}: {result.chunk_count} chunks ({result.share_level})")

        seeded = []
        for e in load("entries.json"):
            verified = datetime.combine(date.fromisoformat(e["verified_at"]), datetime.min.time(), timezone.utc)
            expires = policy.expires_at(verified, policy.DEFAULT_EXPIRY_MONTHS[e["entry_type"]])
            entry_id = new_id()
            conn.execute(knowledge_entries.insert().values(
                id=entry_id, team_id=e["team_id"], topic_id=e["topic_id"], question=e["question"], answer=e["answer"],
                entry_type=e["entry_type"], share_level=e["share_level"], status=e["status"],
                verified_by=e["verified_by"], verified_at=verified, expires_at=expires))
            for s in e["sources"]:
                # Seed quotes get the same exact-match check model quotes get (§6).
                if s["quote"] not in texts[s["doc"]]:
                    raise SystemExit(f"Entry {e['key']}: quote not found verbatim in {s['doc']}")
                conn.execute(entry_sources.insert().values(entry_id=entry_id, source_id=doc_ids[s["doc"]], quote=s["quote"]))
            conn.execute(contributions.insert().values(person_id=e["verified_by"], entry_id=entry_id, helped_count=0))
            seeded.append(entry_id)
            log(f"  entry {e['key']}: {e['status']}, expires {expires.date() if expires else 'never'}")

        expired = expiry_sweep(conn)
        log(f"  expiry sweep: {expired} entries need re-confirmation")
        from store.db import one
        import sqlalchemy as sa

        for entry_id in seeded:
            entry = one(conn.execute(sa.select(knowledge_entries).where(knowledge_entries.c.id == entry_id)))
            if entry["status"] == "approved":
                # Seed data is fixed, so its planted conflict is checked deterministically: seeding never
                # calls a paid model (on Vercel every cold instance seeds its own in-memory database).
                found = detect_conflicts(conn, entry, llm=MockLLM())
                if found:
                    log(f"  conflict detected on topic {entry['topic_id']}")

    # Jordan joined two days ago (§9.1: "Ramp-up day 3 of 14").
    with db.tx() as conn:
        from datetime import timedelta

        import rampup
        from store.db import one
        import sqlalchemy as sa

        jordan = one(conn.execute(sa.select(people).where(people.c.id == "jordan-kim")))
        rampup.generate(conn, jordan, started=datetime.now(timezone.utc) - timedelta(days=2))

    with db.tx() as conn:
        import sqlalchemy as sa
        from store.schema import chunks, sources

        counts = {
            "sources": conn.execute(sa.select(sa.func.count()).select_from(sources)).scalar(),
            "chunks": conn.execute(sa.select(sa.func.count()).select_from(chunks)).scalar(),
            "entries": conn.execute(sa.select(sa.func.count()).select_from(knowledge_entries)).scalar(),
        }
    log(f"Done ({status['database']}): {counts}")
    return counts


if __name__ == "__main__":
    seed()
