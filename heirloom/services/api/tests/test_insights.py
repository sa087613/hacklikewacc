from tests.conftest import as_


def test_standup_finds_planted_insights_and_filters_noise(client):
    r = client.post("/standup/run", headers=as_("sam-okafor")).json()
    kinds = sorted(i["type"] for i in r["insights"])
    assert kinds == ["conflict", "overlap", "reuse"]
    assert r["stats"]["low_confidence"] == 1  # the deliberately weak insight is hidden
    for i in r["insights"]:
        assert len({e["team"] for e in i["evidence"]}) >= 2  # evidence from both sides


def test_not_relevant_feedback_suppresses_and_tunes(client):
    first = client.post("/standup/run", headers=as_("sam-okafor")).json()
    conflict = next(i for i in first["insights"] if i["type"] == "conflict")
    client.post(f"/insights/{conflict['id']}/feedback", json={"status": "not_relevant"}, headers=as_("ana-torres"))
    again = client.post("/standup/run", headers=as_("sam-okafor")).json()
    assert again["stats"]["suppressed"] == 1
    assert again["stats"]["thresholds"]["conflict"] > 0.7


def test_insights_go_to_leads_of_teams_involved(client):
    client.post("/standup/run", headers=as_("sam-okafor"))
    notes = client.get("/notifications", headers=as_("priya-nair")).json()
    assert any(n["kind"] == "insight" for n in notes)
    assert not any(n["kind"] == "insight" for n in client.get("/notifications", headers=as_("lena-park")).json())


def test_impact_check_returns_team_specific_concerns(client):
    r = client.post("/impact-check", json={"change_description": "Round overtime to the nearest 15 minutes instead of 6."},
                    headers=as_("sam-okafor")).json()
    by_team = {x["team"]: x for x in r["results"]}
    assert set(by_team) == {"payroll", "benefits"}
    assert not by_team["payroll"]["no_impact"] and not by_team["benefits"]["no_impact"]
    benefits_quotes = [c["quote"] for con in by_team["benefits"]["concerns"] for c in con["citations"]]
    assert any("biweekly totals" in q for q in benefits_quotes)  # the weekly vs. biweekly conflict
    calls = client.get("/network/calls").json()
    assert sum(1 for c in calls if c["tool"] == "assess_impact") == 2  # agent calls are logged


def test_unrelated_change_has_no_impact(client):
    r = client.post("/impact-check", json={"change_description": "Rename the cafeteria wifi network"},
                    headers=as_("sam-okafor")).json()
    assert all(x["no_impact"] for x in r["results"])
