from tests.conftest import as_


def test_rampup_covers_dependent_teams_without_withheld_or_departing(client):
    path = client.get("/rampup/jordan-kim", headers=as_("jordan-kim")).json()
    assert path["day"] == 3 and path["days"] == 14  # seeded: Jordan joined two days ago
    assert [t["team_id"] for t in path["teams"]] == ["time", "payroll", "benefits"]
    titles = {i["title"] for i in path["items"]}
    assert "Benefits vendor contracts" not in titles  # team-only knowledge is withheld from Jordan
    assert "Maria Lopez" not in {i["title"] for i in path["items"] if i["kind"] == "person"}
    gaps = [i for i in path["items"] if i["kind"] == "gap"]
    assert any(g["title"] == "Retro pay corrections with overtime" for g in gaps)
    topic = next(i for i in path["items"] if i["kind"] == "topic")
    assert client.post(f"/rampup/items/{topic['id']}/toggle", headers=as_("jordan-kim")).json()["done"] is True
    assert client.post(f"/rampup/items/{topic['id']}/toggle", headers=as_("chloe-reyes")).status_code == 404


def test_contributor_credit_counts_people_and_teams(client):
    q = "Is overtime included in gross pay before pre-tax benefit deductions are calculated?"
    for who in ("jordan-kim", "chloe-reyes", "priya-nair", "jordan-kim"):  # Jordan twice: counted once
        client.post("/ask?stream=false", json={"question": q}, headers=as_(who))
    impact = client.get("/people/maria-lopez/impact").json()
    assert impact["people_helped"] == 3 and impact["teams_reached"] == 2
    home = client.get("/home", headers=as_("maria-lopez")).json()
    assert home["impact"]["people_helped"] == 3
