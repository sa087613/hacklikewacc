"""Knowledge lifecycle: expert answers → knowledge PRs → approved entries (SPEC §5.2, §6).

Also corrections (flag → fix → notify everyone who got the old answer), expiry and
re-confirmation, and conflicting-expert detection. All rules run here, server side.
"""
from typing import Dict, List, Optional

import sqlalchemy as sa

import policy
from ingest import ingest_source
from notifications import notify
from providers import get_llm
from store.db import one, rows
from store.schema import (answer_deliveries, answers, chunks, contributions, entry_flags, entry_sources, inbox_items,
                          knowledge_entries, knowledge_prs, new_id, now, people, topic_knowers, topics)


class PermissionDenied(Exception):
    pass


class NotFound(Exception):
    pass


def _get(conn, table, id_):
    row = one(conn.execute(sa.select(table).where(table.c.id == id_)))
    if row is None:
        raise NotFound(f"{table.name} {id_} not found")
    return row


def _name(conn, pid) -> Optional[str]:
    return conn.execute(sa.select(people.c.name).where(people.c.id == pid)).scalar() if pid else None


def can_review(conn, person: Dict, team_id: str) -> bool:
    owner = policy.knowledge_owner(conn, team_id)
    return bool(person) and (person["id"] == (owner or {}).get("id") or
                             (person["team_id"] == team_id and policy.is_lead(person)))


def entry_view(conn, e: Dict) -> Dict:
    quotes = rows(conn.execute(sa.select(entry_sources).where(entry_sources.c.entry_id == e["id"])))
    return {
        "id": e["id"], "team_id": e["team_id"], "topic_id": e["topic_id"], "question": e["question"],
        "summary": e["answer"].get("summary", ""), "steps": e["answer"].get("steps", []),
        "caveats": e["answer"].get("caveats", []), "entry_type": e["entry_type"], "share_level": e["share_level"],
        "status": e["status"], "verified_by": _name(conn, e["verified_by"]), "verified_by_id": e["verified_by"],
        "verified_at": e["verified_at"].isoformat() if e["verified_at"] else None,
        "expires_at": e["expires_at"].isoformat() if e["expires_at"] else None,
        "source_id": e["source_id"],
        "citations": [{"source_id": q["source_id"], "quote": q["quote"]} for q in quotes],
    }


def render_entry_text(question: str, answer: Dict, expert_name: Optional[str], transcript: Optional[str] = None) -> str:
    parts = [f"Question: {question}", "", answer.get("summary", "").strip()]
    if answer.get("steps"):
        parts += ["", "Steps:"] + [f"{i}. {s}" for i, s in enumerate(answer["steps"], 1)]
    if answer.get("caveats"):
        parts += ["", "Caveats:"] + [f"- {c}" for c in answer["caveats"]]
    if expert_name:
        parts += ["", f"Answered by {expert_name}."]
    if transcript:
        parts += ["", "Original answer (transcript):", "", transcript.strip()]
    return "\n".join(parts).strip() + "\n"


# ------------------------------------------------------------------ inbox → PR

def create_pr(conn, *, team_id: str, topic_id: Optional[str], question: str, draft: Dict, expert_id: str,
              origin: Dict, inbox_item_id: Optional[str] = None, exit_interview_id: Optional[str] = None) -> Dict:
    entry_type = draft.get("entry_type") if draft.get("entry_type") in policy.ENTRY_TYPES else "process"
    share = conn.execute(sa.text("select default_share_level from teams where id = :t"), {"t": team_id}).scalar()
    entry_id = new_id()
    answer = {"summary": draft.get("summary", ""), "steps": draft.get("steps", []), "caveats": draft.get("caveats", [])}
    conn.execute(knowledge_entries.insert().values(
        id=entry_id, team_id=team_id, topic_id=topic_id, question=question, answer=answer, entry_type=entry_type,
        share_level=share, status="draft"))
    owner = policy.knowledge_owner(conn, team_id)
    diff = {**answer, "question": question, "entry_type": entry_type, "share_level": share,
            "expiry_months": policy.expiry_months(conn, team_id, entry_type), "origin": origin}
    res = conn.execute(knowledge_prs.insert().values(
        entry_id=entry_id, team_id=team_id, proposed_by=expert_id, reviewer_id=owner["id"] if owner else None,
        status="open", diff=diff, inbox_item_id=inbox_item_id, exit_interview_id=exit_interview_id))
    pr_id = res.inserted_primary_key[0]
    if owner:
        notify(conn, owner["id"], "pr", f"Knowledge PR #{pr_id} to review", question, "/inbox?tab=prs")
    return pr_view(conn, _get(conn, knowledge_prs, pr_id))


def answer_inbox_item(conn, item_id: str, expert: Dict, transcript: str, origin: Dict) -> Dict:
    item = _get(conn, inbox_items, item_id)
    if item["merged_into_id"]:
        item = _get(conn, inbox_items, item["merged_into_id"])
    if item["status"] == "answered":
        raise PermissionDenied("This question has already been answered.")
    if expert["id"] not in (item["expert_id"], item["escalated_to"]) and not (
        expert["team_id"] == item["team_id"] and policy.is_lead(expert)
    ):
        raise PermissionDenied("Only the assigned expert or the team lead can answer this question.")
    draft = get_llm().structure_answer(item["question"], transcript, expert["name"])
    pr = create_pr(conn, team_id=item["team_id"], topic_id=item["topic_id"], question=item["question"], draft=draft,
                   expert_id=expert["id"], origin={**origin, "transcript": transcript}, inbox_item_id=item["id"])
    t = now()
    conn.execute(inbox_items.update().where(
        sa.or_(inbox_items.c.id == item["id"], inbox_items.c.merged_into_id == item["id"])
    ).values(status="answered", answered_at=t))
    return pr


def pr_view(conn, pr: Dict) -> Dict:
    item = one(conn.execute(sa.select(inbox_items).where(inbox_items.c.id == pr["inbox_item_id"]))) if pr[
        "inbox_item_id"] else None
    return {
        "id": pr["id"], "entry_id": pr["entry_id"], "team_id": pr["team_id"], "status": pr["status"],
        "proposed_by": _name(conn, pr["proposed_by"]), "proposed_by_id": pr["proposed_by"],
        "reviewer": _name(conn, pr["reviewer_id"]), "reviewer_id": pr["reviewer_id"], "diff": pr["diff"],
        "created_at": pr["created_at"].isoformat(), "inbox_item_id": pr["inbox_item_id"],
        "exit_interview_id": pr["exit_interview_id"],
        "asked_by": _name(conn, item["asker_person_id"]) if item else None,
    }


def edit_pr(conn, pr_id: int, person: Dict, edits: Dict) -> Dict:
    pr = _get(conn, knowledge_prs, pr_id)
    if pr["status"] != "open":
        raise PermissionDenied("This PR is already closed.")
    if not can_review(conn, person, pr["team_id"]) and person["id"] != pr["proposed_by"]:
        raise PermissionDenied("Only the knowledge owner or the expert can edit this PR.")
    diff = {**pr["diff"], **{k: v for k, v in edits.items() if v is not None}}
    if diff.get("share_level") not in policy.SHARE_LEVELS:
        raise ValueError("Invalid share level.")
    conn.execute(knowledge_prs.update().where(knowledge_prs.c.id == pr_id).values(diff=diff))
    return pr_view(conn, _get(conn, knowledge_prs, pr_id))


def approve_pr(conn, pr_id: int, reviewer: Dict) -> Dict:
    pr = _get(conn, knowledge_prs, pr_id)
    if pr["status"] != "open":
        raise PermissionDenied("This PR is already closed.")
    if not can_review(conn, reviewer, pr["team_id"]):
        raise PermissionDenied("Only the team's knowledge owner can approve knowledge PRs.")
    d = pr["diff"]
    entry = _get(conn, knowledge_entries, pr["entry_id"])
    expert_id = pr["proposed_by"]
    t = now()
    answer = {"summary": d.get("summary", ""), "steps": d.get("steps", []), "caveats": d.get("caveats", [])}
    origin = d.get("origin") or {}
    text = render_entry_text(d["question"], answer, _name(conn, expert_id), origin.get("transcript"))
    src = ingest_source(
        conn, team_id=pr["team_id"], title=f"Expert answer: {d['question']}", text=text,
        source_type="voice_note" if origin.get("kind") == "voice" else "expert_answer",
        share_level=d.get("share_level"), topic_ids=[entry["topic_id"]] if entry["topic_id"] else [],
        author_ids=[expert_id], label=d["question"],
    )
    months = d.get("expiry_months") if "expiry_months" in d else policy.expiry_months(conn, pr["team_id"], d["entry_type"])
    conn.execute(knowledge_entries.update().where(knowledge_entries.c.id == entry["id"]).values(
        question=d["question"], answer=answer, entry_type=d.get("entry_type", entry["entry_type"]),
        share_level=d.get("share_level", entry["share_level"]), status="approved", verified_by=expert_id,
        verified_at=t, expires_at=policy.expires_at(t, months), source_id=src.source_id))
    if answer["summary"]:
        conn.execute(entry_sources.insert().values(entry_id=entry["id"], source_id=src.source_id, quote=answer["summary"]))
    if entry["topic_id"]:
        exists = conn.execute(sa.select(topic_knowers).where(
            topic_knowers.c.topic_id == entry["topic_id"], topic_knowers.c.person_id == expert_id,
            topic_knowers.c.role == "answerer")).first()
        if not exists:
            conn.execute(topic_knowers.insert().values(topic_id=entry["topic_id"], person_id=expert_id, role="answerer"))
    if not conn.execute(sa.select(contributions).where(contributions.c.person_id == expert_id,
                                                       contributions.c.entry_id == entry["id"])).first():
        conn.execute(contributions.insert().values(person_id=expert_id, entry_id=entry["id"], helped_count=0))
    conn.execute(knowledge_prs.update().where(knowledge_prs.c.id == pr_id).values(status="approved", decided_at=t))

    # Notify the original askers (including merged duplicates).
    if pr["inbox_item_id"]:
        for it in rows(conn.execute(sa.select(inbox_items).where(sa.or_(
            inbox_items.c.id == pr["inbox_item_id"], inbox_items.c.merged_into_id == pr["inbox_item_id"])))):
            notify(conn, it["asker_person_id"], "answered", "Your question was answered", it["question"],
                   f"/ask?q={it['question']}")
    notify(conn, expert_id, "approved", f"Your answer was approved (PR #{pr_id})", d["question"], "/knowledge")
    detect_conflicts(conn, _get(conn, knowledge_entries, entry["id"]))
    return entry_view(conn, _get(conn, knowledge_entries, entry["id"]))


def reject_pr(conn, pr_id: int, reviewer: Dict) -> Dict:
    pr = _get(conn, knowledge_prs, pr_id)
    if pr["status"] != "open":
        raise PermissionDenied("This PR is already closed.")
    if not can_review(conn, reviewer, pr["team_id"]):
        raise PermissionDenied("Only the team's knowledge owner can reject knowledge PRs.")
    conn.execute(knowledge_prs.update().where(knowledge_prs.c.id == pr_id).values(status="rejected", decided_at=now()))
    conn.execute(knowledge_entries.update().where(knowledge_entries.c.id == pr["entry_id"]).values(status="superseded"))
    if pr["inbox_item_id"]:  # the question is open again
        conn.execute(inbox_items.update().where(sa.or_(
            inbox_items.c.id == pr["inbox_item_id"], inbox_items.c.merged_into_id == pr["inbox_item_id"]
        )).values(status="pending", answered_at=None, created_at=now()))
    notify(conn, pr["proposed_by"], "rejected", f"Knowledge PR #{pr_id} was not approved", pr["diff"]["question"])
    return pr_view(conn, _get(conn, knowledge_prs, pr_id))


# ------------------------------------------------------------- corrections

def flag(conn, person: Dict, reason: Optional[str], entry_id: Optional[str] = None, answer_id: Optional[str] = None):
    if entry_id:
        entry = _get(conn, knowledge_entries, entry_id)
        team_id, title = entry["team_id"], entry["question"]
    else:
        ans = _get(conn, answers, answer_id)
        ids = ans["card"].get("entry_ids") or []
        if ids:
            return flag(conn, person, reason, entry_id=ids[0])
        team_id, title = ans["agent_team"], ans["question"]
    conn.execute(entry_flags.insert().values(id=new_id(), entry_id=entry_id, answer_id=answer_id,
                                             flagged_by=person["id"], reason=reason))
    owner = policy.knowledge_owner(conn, team_id)
    notify(conn, owner["id"] if owner else None, "flag", f"{person['name']} flagged an answer as wrong",
           f"{title}" + (f" — {reason}" if reason else ""), "/inbox?tab=prs")
    return {"flagged": True, "routed_to": owner["name"] if owner else None}


def fix_entry(conn, entry_id: str, person: Dict, answer: Dict) -> Dict:
    entry = _get(conn, knowledge_entries, entry_id)
    if not can_review(conn, person, entry["team_id"]):
        raise PermissionDenied("Only the knowledge owner can correct an entry.")
    t = now()
    if entry["source_id"]:  # retire the old text from search; keep the row for history
        conn.execute(chunks.delete().where(chunks.c.source_id == entry["source_id"]))
    src = ingest_source(
        conn, team_id=entry["team_id"], title=f"Expert answer: {entry['question']}",
        text=render_entry_text(entry["question"], answer, person["name"]), source_type="expert_answer",
        share_level=entry["share_level"], topic_ids=[entry["topic_id"]] if entry["topic_id"] else [],
        author_ids=[person["id"]], label=entry["question"])
    months = policy.expiry_months(conn, entry["team_id"], entry["entry_type"])
    conn.execute(entry_sources.delete().where(entry_sources.c.entry_id == entry_id))
    conn.execute(entry_sources.insert().values(entry_id=entry_id, source_id=src.source_id, quote=answer["summary"]))
    conn.execute(knowledge_entries.update().where(knowledge_entries.c.id == entry_id).values(
        answer=answer, status="approved", verified_by=person["id"], verified_at=t,
        expires_at=policy.expires_at(t, months), source_id=src.source_id, reconfirm_requested_at=None))
    conn.execute(entry_flags.update().where(entry_flags.c.entry_id == entry_id, entry_flags.c.resolved_at.is_(None))
                 .values(resolved_at=t))
    recipients = conn.execute(sa.select(answer_deliveries.c.person_id).where(
        answer_deliveries.c.entry_id == entry_id)).scalars().all()
    for pid in recipients:
        notify(conn, pid, "correction", "Correction to an answer you received",
               f"{entry['question']} — updated: {answer['summary']}", f"/ask?q={entry['question']}")
    return {**entry_view(conn, _get(conn, knowledge_entries, entry_id)), "notified": len(recipients)}


def reconfirm(conn, entry_id: str, person: Dict) -> Dict:
    entry = _get(conn, knowledge_entries, entry_id)
    if not can_review(conn, person, entry["team_id"]) and person["id"] != entry["verified_by"]:
        raise PermissionDenied("Only the knowledge owner or the verifying expert can re-confirm.")
    t = now()
    months = policy.expiry_months(conn, entry["team_id"], entry["entry_type"])
    conn.execute(knowledge_entries.update().where(knowledge_entries.c.id == entry_id).values(
        status="approved" if entry["status"] == "expired" else entry["status"], verified_at=t,
        verified_by=person["id"], expires_at=policy.expires_at(t, months), reconfirm_requested_at=None))
    return entry_view(conn, _get(conn, knowledge_entries, entry_id))


def expiry_sweep(conn) -> int:
    """Approved entries past expiry become 'expired' (still shown, labeled), and owners are pinged once."""
    t = now()
    due = rows(conn.execute(sa.select(knowledge_entries).where(
        knowledge_entries.c.status == "approved", knowledge_entries.c.expires_at.isnot(None),
        knowledge_entries.c.expires_at < t)))
    for e in due:
        conn.execute(knowledge_entries.update().where(knowledge_entries.c.id == e["id"]).values(
            status="expired", reconfirm_requested_at=t))
        owner = policy.knowledge_owner(conn, e["team_id"])
        for pid in {owner["id"] if owner else None, e["verified_by"]}:
            notify(conn, pid, "reconfirm", "Needs re-confirmation", e["question"], "/knowledge")
    # Entries seeded as expired still need their owner pinged.
    for e in rows(conn.execute(sa.select(knowledge_entries).where(
            knowledge_entries.c.status == "expired", knowledge_entries.c.reconfirm_requested_at.is_(None)))):
        conn.execute(knowledge_entries.update().where(knowledge_entries.c.id == e["id"]).values(reconfirm_requested_at=t))
        owner = policy.knowledge_owner(conn, e["team_id"])
        notify(conn, owner["id"] if owner else None, "reconfirm", "Needs re-confirmation", e["question"], "/knowledge")
        due.append(e)
    return len(due)


# --------------------------------------------------------------- conflicts

def detect_conflicts(conn, entry: Dict) -> List[str]:
    """Compare an approved entry with others on its topic. Disagreements are flagged, never resolved."""
    if not entry["topic_id"]:
        return []
    others = rows(conn.execute(sa.select(knowledge_entries).where(
        knowledge_entries.c.topic_id == entry["topic_id"], knowledge_entries.c.id != entry["id"],
        knowledge_entries.c.status.in_(["approved", "conflicted", "expired"]))))
    found = []
    llm = get_llm()
    for o in others:
        verdict = llm.detect_conflict(
            {"question": entry["question"], "answer": entry["answer"]}, {"question": o["question"], "answer": o["answer"]})
        if verdict.get("conflict"):
            found.append(o["id"])
    if found:
        conn.execute(knowledge_entries.update().where(knowledge_entries.c.id.in_(found + [entry["id"]]))
                     .values(status="conflicted"))
        owner = policy.knowledge_owner(conn, entry["team_id"])
        topic = conn.execute(sa.select(topics.c.name).where(topics.c.id == entry["topic_id"])).scalar()
        notify(conn, owner["id"] if owner else None, "conflict", f"Conflicting answers: {topic}",
               "Two approved answers disagree. Pick the one to keep.", "/inbox?tab=prs")
    return found


def resolve_conflict(conn, keep_entry_id: str, person: Dict) -> Dict:
    keep = _get(conn, knowledge_entries, keep_entry_id)
    if keep["status"] != "conflicted":
        raise PermissionDenied("This entry is not in conflict.")
    if not can_review(conn, person, keep["team_id"]):
        raise PermissionDenied("Only the knowledge owner can resolve conflicting answers.")
    losers = conn.execute(sa.select(knowledge_entries.c.id).where(
        knowledge_entries.c.topic_id == keep["topic_id"], knowledge_entries.c.status == "conflicted",
        knowledge_entries.c.id != keep_entry_id)).scalars().all()
    conn.execute(knowledge_entries.update().where(knowledge_entries.c.id.in_(losers)).values(status="superseded"))
    t = now()
    conn.execute(knowledge_entries.update().where(knowledge_entries.c.id == keep_entry_id).values(
        status="approved", verified_at=t, verified_by=person["id"],
        expires_at=policy.expires_at(t, policy.expiry_months(conn, keep["team_id"], keep["entry_type"]))))
    for pid in conn.execute(sa.select(answer_deliveries.c.person_id).where(
            answer_deliveries.c.entry_id.in_(losers))).scalars().all():
        notify(conn, pid, "correction", "Correction to an answer you received",
               f"{keep['question']} — resolved: {keep['answer'].get('summary', '')}")
    return entry_view(conn, _get(conn, knowledge_entries, keep_entry_id))


def open_conflicts(conn, team_ids: List[str]) -> List[Dict]:
    out: Dict[str, Dict] = {}
    for e in rows(conn.execute(sa.select(knowledge_entries).where(
            knowledge_entries.c.status == "conflicted", knowledge_entries.c.team_id.in_(team_ids)))):
        g = out.setdefault(e["topic_id"], {"topic_id": e["topic_id"], "team_id": e["team_id"], "entries": [],
                                           "topic": conn.execute(sa.select(topics.c.name).where(
                                               topics.c.id == e["topic_id"])).scalar()})
        g["entries"].append(entry_view(conn, e))
    return list(out.values())
