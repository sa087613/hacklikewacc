"""§6 knowledge quality: corrections propagate, expiry, conflicting experts."""
from tests.conftest import as_

OT = "Is overtime included in gross pay before pre-tax benefit deductions are calculated?"


def _ask(client, who, q):
    return client.post("/ask?stream=false", json={"question": q}, headers=as_(who)).json()


def test_flag_fix_notifies_everyone_who_got_the_old_answer(client):
    a = _ask(client, "jordan-kim", OT)
    b = _ask(client, "chloe-reyes", OT)
    entry_id = a["entry_ids"][0]
    assert b["entry_ids"][0] == entry_id
    r = client.post(f"/entries/{entry_id}/flag", json={"reason": "Missing the 401(k) case"}, headers=as_("jordan-kim")).json()
    assert r["routed_to"] == "Ana Torres"
    assert any(f["entry"]["id"] == entry_id for f in client.get("/inbox", headers=as_("ana-torres")).json()["flags"])
    # Only the knowledge owner can correct it.
    fix = {"summary": "Yes. Overtime is in gross pay before pre-tax deductions, including pre-tax 401(k).", "steps": [], "caveats": []}
    assert client.put(f"/entries/{entry_id}", json=fix, headers=as_("jordan-kim")).status_code == 403
    fixed = client.put(f"/entries/{entry_id}", json=fix, headers=as_("ana-torres")).json()
    assert fixed["notified"] == 2
    for who in ("jordan-kim", "chloe-reyes"):
        assert any(n["kind"] == "correction" for n in client.get("/notifications", headers=as_(who)).json())
    assert client.get("/inbox", headers=as_("ana-torres")).json()["flags"] == []
    # The next answer uses the corrected text, still expert-verified.
    again = _ask(client, "jordan-kim", "Is overtime in gross pay before pre-tax deductions, including 401(k)?")
    assert any("401(k)" in p["text"] for p in again["points"])


def test_expired_entry_is_labeled_and_reconfirmable(client):
    q = "Can employees edit their own punches after submitting a timesheet?"
    card = _ask(client, "jordan-kim", q)
    assert card["needs_reconfirmation"]["months_ago"] >= 7
    assert card["needs_reconfirmation"]["requested"] is True
    owner_notes = client.get("/notifications", headers=as_("sam-okafor")).json()
    assert any(n["kind"] == "reconfirm" for n in owner_notes)  # the owner was pinged
    entry_id = card["needs_reconfirmation"]["entry_id"]
    assert client.post(f"/entries/{entry_id}/reconfirm", headers=as_("sam-okafor")).json()["status"] == "approved"
    assert _ask(client, "jordan-kim", q)["needs_reconfirmation"] is None


def test_conflicting_experts_show_both_and_owner_resolves(client):
    card = _ask(client, "jordan-kim", "When is unused PTO paid out after an employee leaves?")
    assert card["state"] == "conflict"
    assert len(card["conflict"]["entries"]) == 2 and card["conflict"]["routed_to"] == "Ana Torres"
    conflicts = client.get("/inbox", headers=as_("ana-torres")).json()["conflicts"]
    keep = next(e for e in conflicts[0]["entries"] if "next regular pay date" in e["summary"])
    assert client.post(f"/entries/{keep['id']}/keep", headers=as_("jordan-kim")).status_code == 403
    assert client.post(f"/entries/{keep['id']}/keep", headers=as_("ana-torres")).json()["status"] == "approved"
    after = _ask(client, "jordan-kim", "When is unused PTO paid out after an employee leaves?")
    assert after["state"] != "conflict"
