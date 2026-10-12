"""Scam DNA / Campaign Radar / overview / demo endpoints."""
import pytest

from app.scamdna.demo import CAMPAIGN_CASES, SCENARIOS

API = "/api/v1"
KYC = "Dear SBI customer, your KYC is pending. Your account will be blocked today."
LINK = "Update now at http://sbi-kyc-update.example/kyc/login to avoid suspension."
OTP = "Caller from the SBI fraud team asked me to share the OTP 482913 sent to my phone."


def new_case(client, h, title="Suspicious SMS"):
    r = client.post(f"{API}/cases", json={"title": title}, headers=h)
    assert r.status_code == 201
    return r.json()


def add(client, h, cid, content, kind="message", **kw):
    r = client.post(f"{API}/cases/{cid}/events", json={"kind": kind, "content": content, **kw}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_cases_require_a_profile(client):
    assert client.get(f"{API}/cases").status_code == 401
    assert client.post(f"{API}/cases", json={"title": "x"}).status_code == 401
    assert client.get(f"{API}/overview").status_code == 401


def test_case_evolves_and_explains_each_step(client, profile):
    h = profile["headers"]
    c = new_case(client, h)
    assert c["assessment"] is None and c["events"] == []

    r1 = add(client, h, c["id"], KYC, channel="sms")
    assert r1["alert"]["action"] == "new" and r1["alert"]["notify"]
    assert r1["case"]["risk_level"] == "medium"

    r2 = add(client, h, c["id"], LINK)
    assert r2["change"]["delta"] > 0 and r2["case"]["risk_level"] == "high"
    assert r2["alert"]["action"] == "escalated"
    assert any("credential-harvesting" in line for line in r2["change"]["explanation"])

    r3 = add(client, h, c["id"], OTP, channel="call")
    assert r3["alert"]["action"] == "updated"
    detail = client.get(f"{API}/cases/{c['id']}", headers=h).json()
    assert [e["seq"] for e in detail["events"]] == [1, 2, 3]
    assert "482913" not in detail["events"][2]["excerpt"]          # OTP never stored
    assert detail["assessment"]["stages_observed"] == ["hook", "pressure", "harvest"]
    actions = [x["alert_action"] for x in detail["log"] if x["alert_action"]]
    assert actions[:3] == ["updated", "escalated", "new"]          # newest first


def test_resubmitting_unchanged_evidence_is_suppressed(client, profile):
    h = profile["headers"]
    c = new_case(client, h)
    add(client, h, c["id"], KYC)
    r = add(client, h, c["id"], KYC)
    assert r["event"] is None and r["duplicate_of"]
    assert r["alert"]["action"] == "suppressed" and not r["alert"]["notify"]
    assert len(r["case"]["events"]) == 1
    ov = client.get(f"{API}/overview", headers=h).json()
    assert ov["duplicates_suppressed"]["total"] == 1 and ov["alerts_raised"]["total"] == 1


def test_new_material_evidence_reassesses_and_alerts(client, profile):
    h = profile["headers"]
    c = new_case(client, h)
    add(client, h, c["id"], KYC)
    minor = add(client, h, c["id"], "Reminder: your SBI account will be blocked today.")
    assert minor["alert"]["action"] == "suppressed"
    major = add(client, h, c["id"], "Install AnyDesk so our SBI officer can fix your account.")
    assert major["alert"]["action"] in ("updated", "escalated") and major["alert"]["notify"]


def test_removing_evidence_reassesses(client, profile):
    h = profile["headers"]
    c = new_case(client, h)
    add(client, h, c["id"], KYC)
    r = add(client, h, c["id"], OTP)
    otp_event = r["event"]["id"]
    before = r["case"]["risk_score"]
    after = client.delete(f"{API}/cases/{c['id']}/events/{otp_event}", headers=h).json()
    assert after["risk_score"] < before
    assert all(t["code"] != "secret_request" for t in after["assessment"]["tactics"])


def test_status_changes_are_logged(client, profile):
    h = profile["headers"]
    c = new_case(client, h)
    r = client.patch(f"{API}/cases/{c['id']}", json={"status": "closed", "title": "Closed case"}, headers=h).json()
    assert r["status"] == "closed" and r["title"] == "Closed case"
    assert r["log"][0]["action"] == "status_changed"
    assert client.patch(f"{API}/cases/{c['id']}", json={"status": "bogus"}, headers=h).status_code == 422


def test_other_profiles_cannot_see_or_change_cases(client, profile):
    c = new_case(client, profile["headers"])
    other = client.post(f"{API}/profiles", json={"display_name": "Mallory"}).json()
    oh = {"Authorization": f"Bearer {other['token']}"}
    assert client.get(f"{API}/cases/{c['id']}", headers=oh).status_code == 404
    assert client.post(f"{API}/cases/{c['id']}/events", json={"kind": "message", "content": KYC}, headers=oh).status_code == 404
    assert client.delete(f"{API}/cases/{c['id']}", headers=oh).status_code == 404
    assert client.get(f"{API}/cases", headers=oh).json() == []
    assert client.post(f"{API}/forensics/text", json={"text": KYC, "case_id": c["id"]}, headers=oh).status_code == 404


def test_event_validation(client, profile):
    h = profile["headers"]
    c = new_case(client, h)
    url = f"{API}/cases/{c['id']}/events"
    assert client.post(url, json={"kind": "message", "content": "   "}, headers=h).status_code == 422
    assert client.post(url, json={"kind": "message", "content": "a" * 5001}, headers=h).status_code == 422
    assert client.post(url, json={"kind": "pdf", "content": "x"}, headers=h).status_code == 422
    assert client.post(url, json={"kind": "url", "content": "has space.example"}, headers=h).status_code == 422
    assert client.post(url, json={"kind": "message", "content": KYC, "channel": "pigeon"}, headers=h).status_code == 422
    naive = client.post(url, json={"kind": "message", "content": KYC, "observed_at": "2026-10-01T09:00:00"}, headers=h)
    assert naive.status_code == 422


def test_reported_times_order_the_chain(client, profile):
    h = profile["headers"]
    c = new_case(client, h)
    add(client, h, c["id"], OTP, observed_at="2026-10-01T11:00:00+05:30")
    r = add(client, h, c["id"], KYC, observed_at="2026-10-01T09:00:00+05:30")
    order = r["case"]["assessment"]["order"]
    assert order["basis"] == "reported_time"
    assert order["sequence"][0] == r["event"]["id"]


def test_case_and_event_limits(client, profile, monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "max_case_events", 2)
    h = profile["headers"]
    c = new_case(client, h)
    add(client, h, c["id"], KYC)
    add(client, h, c["id"], LINK)
    r = client.post(f"{API}/cases/{c['id']}/events", json={"kind": "message", "content": OTP}, headers=h)
    assert r.status_code == 409


def test_delete_case_and_export(client, profile):
    h = profile["headers"]
    c = new_case(client, h)
    add(client, h, c["id"], OTP)
    exp = client.get(f"{API}/profiles/me/export", headers=h).json()
    assert exp["investigations"][0]["evidence"][0]["redacted_excerpt"]
    assert "482913" not in str(exp)
    assert client.delete(f"{API}/cases/{c['id']}", headers=h).status_code == 204
    assert client.get(f"{API}/cases", headers=h).json() == []


def test_retention_purges_old_cases(client, profile):
    from datetime import datetime, timedelta, timezone

    from app.db import SessionLocal
    from app.models import ScamCase
    h = profile["headers"]
    c = new_case(client, h)
    with SessionLocal() as db:
        db.get(ScamCase, c["id"]).updated_at = datetime.now(timezone.utc) - timedelta(days=400)
        db.commit()
    assert client.get(f"{API}/cases", headers=h).json() == []


@pytest.mark.parametrize("sc", SCENARIOS, ids=[s["key"] for s in SCENARIOS])
def test_demo_scenarios_reproduce_expected_outcomes_live(client, profile, sc):
    h = profile["headers"]
    case = client.post(f"{API}/demo/scenarios/{sc['key']}/cases", headers=h).json()
    assert case["is_demo"] and case["title"].startswith("DEMO")
    for e in sc["events"]:
        r = add(client, h, case["id"], e["content"], kind=e["kind"], channel=e["channel"])
        assert r["event"]["source"] == "demo_fixture"
    chk = client.get(f"{API}/demo/scenarios/{sc['key']}/check/{case['id']}", headers=h).json()
    assert chk["matches"], chk["problems"]
    assert chk["complete"]


def test_demo_campaigns_and_dismissal(client, profile):
    h = profile["headers"]
    r = client.post(f"{API}/demo/campaigns", headers=h).json()
    assert r["cases_created"] == len(CAMPAIGN_CASES) and "DEMO DATA" in r["label"]
    camp = client.get(f"{API}/campaigns", headers=h).json()
    assert len(camp["campaigns"]) == 3 and all(c["is_demo"] for c in camp["campaigns"])
    titles = [{m["title"] for m in c["members"]} for c in camp["campaigns"]]
    assert not any("Genuine OTP" in t for ts in titles for t in ts)            # benign never clustered
    assert not any("Parcel" in t for ts in titles for t in ts)                 # unrelated stays alone
    kyc = next(c for c in camp["campaigns"] if any("KYC suspension SMS (A)" in m["title"] for m in c["members"]))
    assert any("sbi-kyc-update.example" in x for x in kyc["exact_indicators"])

    # Dismiss the heuristic-only member (C, different domain) from the KYC cluster.
    ids = {m["title"]: m["id"] for m in kyc["members"]}
    c_id = ids["DEMO · KYC suspension SMS (C, different domain)"]
    for other in [i for t, i in ids.items() if i != c_id]:
        assert client.post(f"{API}/campaigns/dismissals", json={"case_a": c_id, "case_b": other}, headers=h).status_code == 201
    camp2 = client.get(f"{API}/campaigns", headers=h).json()
    assert all(c_id not in c["member_ids"] for c in camp2["campaigns"])
    assert camp2["dismissed_links"]
    restore = client.request("DELETE", f"{API}/campaigns/dismissals", json={"case_a": c_id, "case_b": other}, headers=h)
    assert restore.status_code == 204

    ov = client.get(f"{API}/overview", headers=h).json()
    assert ov["investigations"]["total"] == ov["investigations"]["demo"] == len(CAMPAIGN_CASES)
    assert ov["campaigns"]["total"] >= 2 and "DEMO" in ov["source"]
    assert ov["recent_activity"] and ov["recent_activity"][0]["is_demo"]

    # Reloading replaces, not duplicates; clearing removes all demo cases.
    client.post(f"{API}/demo/campaigns", headers=h)
    assert len(client.get(f"{API}/cases", headers=h).json()) == len(CAMPAIGN_CASES)
    assert client.delete(f"{API}/demo/cases", headers=h).status_code == 204
    assert client.get(f"{API}/cases", headers=h).json() == []


def test_unknown_scenario_and_foreign_case(client, profile):
    h = profile["headers"]
    assert client.post(f"{API}/demo/scenarios/nope/cases", headers=h).status_code == 404
    real = new_case(client, h)
    add(client, h, real["id"], KYC)
    assert client.get(f"{API}/demo/scenarios/kyc_suspension/check/{real['id']}", headers=h).status_code == 404
