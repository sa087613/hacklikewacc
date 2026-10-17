"""Reset the database and load all seed data (SPEC §14).

Usage (from services/api):  python scripts/seed.py
"""
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import ROOT  # noqa: E402
from db import connect  # noqa: E402
from ingest import ingest_source, parse_file  # noqa: E402

DB = ROOT / "db"
SEED = DB / "seed"


def load(name):
    return json.loads((SEED / name).read_text())


def add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    y, m = d.year + m // 12, m % 12 + 1
    return date(y, m, min(d.day, 28))


def main():
    print("Applying schema…")
    conn = connect(register_vectors=False)
    conn.execute((DB / "schema.sql").read_text())
    conn.commit()
    conn.close()

    conn = connect()
    with conn.transaction():
        teams = load("teams.json")
        for t in teams:
            conn.execute(
                """insert into teams (id, name, accent_color, capability_card, default_share_level)
                   values (%s, %s, %s, %s, %s)""",
                (t["id"], t["name"], t["accent_color"], json.dumps(t["capability_card"]), t["default_share_level"]),
            )
        for p in load("people.json"):
            conn.execute(
                """insert into people (id, name, title, team_id, role, is_knowledge_owner, is_departing)
                   values (%(id)s, %(name)s, %(title)s, %(team_id)s, %(role)s, %(is_knowledge_owner)s, %(is_departing)s)""",
                p,
            )
        for t in load("topics.json"):
            conn.execute(
                "insert into topics (id, name, team_id, co_owner_team_ids) values (%(id)s, %(name)s, %(team_id)s, %(co_owner_team_ids)s)",
                t,
            )
        for k in load("topic_knowers.json"):
            conn.execute(
                "insert into topic_knowers (topic_id, person_id, role) values (%(topic_id)s, %(person_id)s, %(role)s)",
                k,
            )
        print(f"Loaded {len(teams)} teams, people, topics, knowers.")

        doc_ids = {}
        texts = {}
        for path in sorted((SEED / "docs").glob("*/*.md")):
            rel = f"{path.parent.name}/{path.name}"
            text, meta = parse_file(path.name, path.read_bytes())
            result = ingest_source(
                conn,
                team_id=path.parent.name,
                title=meta["title"],
                text=text,
                source_type=meta.get("type", "doc"),
                share_level=meta.get("share_level"),
                storage_path=str(path.relative_to(ROOT)),
                topic_ids=meta.get("topics", []),
                meta=meta,
            )
            doc_ids[rel] = result.source_id
            texts[rel] = text
            print(f"  ingested {rel}: {result.chunk_count} chunks ({result.share_level})")

        expiry = {t["id"]: {"regulation": 12, "process": 6, "roster": 3, "decision": None} for t in teams}
        for e in load("entries.json"):
            verified = date.fromisoformat(e["verified_at"])
            months = expiry[e["team_id"]][e["entry_type"]]
            expires = add_months(verified, months) if months else None
            status = e["status"]
            if expires and expires < date.today() and status == "approved":
                status = "expired"
            entry_id = conn.execute(
                """insert into knowledge_entries
                     (team_id, topic_id, question, answer, entry_type, share_level, status,
                      verified_by, verified_at, expires_at)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
                (
                    e["team_id"], e["topic_id"], e["question"], json.dumps(e["answer"]),
                    e["entry_type"], e["share_level"], status, e["verified_by"],
                    datetime.combine(verified, datetime.min.time(), timezone.utc),
                    datetime.combine(expires, datetime.min.time(), timezone.utc) if expires else None,
                ),
            ).fetchone()["id"]
            for s in e["sources"]:
                # Seed quotes get the same exact-match check model quotes will get (§6).
                if s["quote"] not in texts[s["doc"]]:
                    raise SystemExit(f"Entry {e['key']}: quote not found verbatim in {s['doc']}")
                conn.execute(
                    "insert into entry_sources (entry_id, source_id, quote) values (%s, %s, %s)",
                    (entry_id, doc_ids[s["doc"]], s["quote"]),
                )
            conn.execute(
                "insert into contributions (person_id, entry_id, helped_count) values (%s, %s, 0)",
                (e["verified_by"], entry_id),
            )
            print(f"  entry {e['key']}: {status}, expires {expires or 'never'}")

    counts = conn.execute(
        """select (select count(*) from sources) s, (select count(*) from chunks) c,
                  (select count(*) from knowledge_entries) e"""
    ).fetchone()
    conn.close()
    print(f"Done: {counts['s']} sources, {counts['c']} chunks, {counts['e']} entries.")


if __name__ == "__main__":
    main()
