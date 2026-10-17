"""Exit interview mode (SPEC §5.7, §9.7): voluntary, consented, reviewed by the person before saving."""
from typing import Dict, Optional

import sqlalchemy as sa

import policy
from agents import call_agent
from busfactor import topic_rows
from knowledge import PermissionDenied, create_pr
from notifications import notify
from providers import get_llm
from store.db import one, tx
from store.schema import exit_interviews, new_id, now, people, topics


def _get(conn, id_):
    row = one(conn.execute(sa.select(exit_interviews).where(exit_interviews.c.id == id_)))
    if not row:
        raise KeyError(id_)
    return row


def view(conn, row: Dict) -> Dict:
    person = one(conn.execute(sa.select(people).where(people.c.id == row["person_id"])))
    starter = one(conn.execute(sa.select(people).where(people.c.id == row["started_by"])))
    tps = {t["id"]: t for t in topic_rows(conn) if t["id"] in row["topic_ids"]}
    return {
        "id": row["id"], "status": row["status"], "consent_at": row["consent_at"].isoformat(),
        "person": {"id": person["id"], "name": person["name"], "team_id": person["team_id"], "title": person["title"]},
        "started_by": {"id": starter["id"], "name": starter["name"]},
        "topics": [{"id": tid, "name": tps[tid]["name"] if tid in tps else tid, "status": row["topic_state"].get(tid),
                    "map_status": tps[tid]["status"] if tid in tps else None} for tid in row["topic_ids"]],
        "current_topic": _current(row),
        "messages": row["messages"], "drafts": row["drafts"],
    }


def _current(row: Dict) -> Optional[str]:
    return next((t for t in row["topic_ids"] if row["topic_state"].get(t) == "in_progress"), None)


def _topic(conn, tid):
    return one(conn.execute(sa.select(topics).where(topics.c.id == tid)))


def start(starter: Dict, person_id: str, consent: bool) -> Dict:
    if not consent:
        raise ValueError("Exit interviews are voluntary and require the person's consent.")
    with tx() as conn:
        person = one(conn.execute(sa.select(people).where(people.c.id == person_id)))
        if not person:
            raise KeyError(person_id)
        if not (policy.is_lead(starter) and starter["team_id"] == person["team_id"]):
            raise PermissionDenied("Only the person's team lead can start an exit interview.")
    sole = call_agent(person["team_id"], "sole_source_topics", {"person_id": person_id})
    with tx() as conn:
        status = {t["id"]: t["status"] for t in topic_rows(conn)}
    order = sorted(sole, key=lambda t: (status.get(t["id"]) != "red", t["name"]))  # undocumented first
    topic_ids = [t["id"] for t in order]
    if not topic_ids:
        raise ValueError(f"{person['name']} is not the only source on any topic.")
    state = {t: "pending" for t in topic_ids}
    state[topic_ids[0]] = "in_progress"
    first = get_llm().exit_question(order[0], person["name"], [])
    row = dict(id=new_id(), person_id=person_id, started_by=starter["id"], consent_at=now(), status="in_progress",
               topic_ids=topic_ids, topic_state=state, drafts={},
               messages=[{"role": "agent", "topic_id": topic_ids[0], "text": first["question"]}])
    with tx() as conn:
        conn.execute(exit_interviews.insert().values(**row))
        notify(conn, person_id, "exit_interview", f"{starter['name']} started a knowledge capture session",
               "Answer at your own pace. You review everything before it's saved.", f"/exit-interview/{row['id']}")
        return view(conn, _get(conn, row["id"]))


def _advance(conn, row: Dict, person_name: str) -> Dict:
    """Move to the next pending topic, or to review."""
    nxt = next((t for t in row["topic_ids"] if row["topic_state"][t] == "pending"), None)
    if nxt:
        row["topic_state"][nxt] = "in_progress"
        q = get_llm().exit_question(_topic(conn, nxt), person_name, [])
        row["messages"].append({"role": "agent", "topic_id": nxt, "text": q["question"]})
    else:
        row["status"] = "in_review"
        row["messages"].append({"role": "agent", "topic_id": None,
                                "text": "That covers every topic. Please review the drafts, then submit them."})
    return row


def message(id_: str, actor: Dict, text: str, kind: str = "text", duration_s: Optional[int] = None) -> Dict:
    with tx() as conn:
        row = _get(conn, id_)
        if actor["id"] not in (row["person_id"], row["started_by"]):
            raise PermissionDenied("Only the interviewee or the lead who started the session can take part.")
        if row["status"] != "in_progress":
            raise ValueError("This interview is not in progress.")
        tid = _current(row)
        person = one(conn.execute(sa.select(people).where(people.c.id == row["person_id"])))
        row = {**row, "messages": list(row["messages"]), "topic_state": dict(row["topic_state"]), "drafts": dict(row["drafts"])}
        row["messages"].append({"role": "person", "topic_id": tid, "text": text.strip(), "kind": kind,
                                "duration_s": duration_s})
        history = [m for m in row["messages"] if m["topic_id"] == tid]
        answers = [m for m in history if m["role"] == "person"]
        topic = _topic(conn, tid)
        transcript = "\n\n".join(m["text"] for m in answers)
        draft = get_llm().structure_answer(f"How are {topic['name'].lower()} handled?", transcript, person["name"])
        voice = [m for m in answers if m.get("kind") == "voice"]
        row["drafts"][tid] = {**draft, "question": f"How are {topic['name'].lower()} handled?",
                              "origin": {"kind": "voice" if voice else "text", "transcript": transcript,
                                         "duration_s": sum(m.get("duration_s") or 0 for m in voice) or None,
                                         "exit_interview": True}}
        nxt = get_llm().exit_question(topic, person["name"], history)
        if nxt.get("done"):
            row["topic_state"][tid] = "captured"
            row = _advance(conn, row, person["name"])
        else:
            row["messages"].append({"role": "agent", "topic_id": tid, "text": nxt["question"]})
        conn.execute(exit_interviews.update().where(exit_interviews.c.id == id_).values(
            messages=row["messages"], topic_state=row["topic_state"], drafts=row["drafts"], status=row["status"]))
        return view(conn, _get(conn, id_))


def skip(id_: str, actor: Dict) -> Dict:
    with tx() as conn:
        row = _get(conn, id_)
        if actor["id"] not in (row["person_id"], row["started_by"]):
            raise PermissionDenied("Only the interviewee or the lead can skip a topic.")
        tid = _current(row)
        if not tid:
            raise ValueError("No topic in progress.")
        person = one(conn.execute(sa.select(people).where(people.c.id == row["person_id"])))
        row = {**row, "messages": list(row["messages"]), "topic_state": dict(row["topic_state"])}
        row["topic_state"][tid] = "captured" if tid in row["drafts"] else "skipped"
        row = _advance(conn, row, person["name"])
        conn.execute(exit_interviews.update().where(exit_interviews.c.id == id_).values(
            messages=row["messages"], topic_state=row["topic_state"], status=row["status"]))
        return view(conn, _get(conn, id_))


def submit(id_: str, actor: Dict, edited: Optional[Dict] = None) -> Dict:
    with tx() as conn:
        row = _get(conn, id_)
        if actor["id"] != row["person_id"]:
            raise PermissionDenied("Only the person being interviewed can review and submit their answers.")
        if row["status"] == "submitted":
            raise ValueError("Already submitted.")
        drafts = {**row["drafts"], **(edited or {})}
        person = one(conn.execute(sa.select(people).where(people.c.id == row["person_id"])))
        prs = []
        for tid, d in drafts.items():
            if not d or not d.get("summary"):
                continue
            prs.append(create_pr(conn, team_id=person["team_id"], topic_id=tid, question=d["question"], draft=d,
                                 expert_id=person["id"], origin=d.get("origin", {"kind": "text"}),
                                 exit_interview_id=id_))
        conn.execute(exit_interviews.update().where(exit_interviews.c.id == id_).values(
            status="submitted", drafts=drafts))
        return {**view(conn, _get(conn, id_)), "prs": prs}
