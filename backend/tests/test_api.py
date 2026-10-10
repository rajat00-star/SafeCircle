from app.security import sign_ticket

API = "/api/v1"
SCAM = "URGENT: your bank account will be blocked. Share the OTP sent to your phone at http://sbi-verify.top/login"


def test_health(client):
    r = client.get(f"{API}/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["message_model_loaded"] and body["url_model_loaded"]


def test_security_headers(client):
    r = client.get(f"{API}/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert r.headers["cache-control"] == "no-store"
    assert r.headers["x-request-id"]


def test_analyze_message_anonymous(client):
    r = client.post(f"{API}/analyze/message", json={"text": SCAM})
    assert r.status_code == 200
    body = r.json()
    assert body["risk_level"] == "high"
    codes = {c["code"] for c in body["categories"]}
    assert {"otp_request", "threat", "suspicious_link"} <= codes
    assert body["stored"] is False and body["alert_ticket"]
    assert body["ai_status"] == "disabled"


def test_analyze_url(client):
    r = client.post(f"{API}/analyze/url", json={"url": "https://paypal.com.account-verify.top/login"})
    assert r.status_code == 200
    assert r.json()["risk_level"] in ("medium", "high")


def test_validation_errors_are_clear(client):
    r = client.post(f"{API}/analyze/message", json={"text": "   "})
    assert r.status_code == 422
    assert r.json()["errors"][0]["field"] == "text"
    r = client.post(f"{API}/analyze/message", json={"text": "a" * 5001})
    assert r.status_code == 422
    r = client.post(f"{API}/analyze/url", json={"url": "has space.com"})
    assert r.status_code == 422


def test_body_size_limit(client):
    r = client.post(f"{API}/analyze/message", content=b"x" * 70_000, headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_rate_limit(client, monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "rate_limit_per_minute", 3)
    codes = [client.post(f"{API}/analyze/message", json={"text": "hello"}).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_invalid_token_rejected(client):
    r = client.get(f"{API}/profiles/me", headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401
    assert client.get(f"{API}/profiles/me").status_code == 401


def test_history_is_off_by_default_and_opt_in(client, profile):
    h = profile["headers"]
    client.post(f"{API}/analyze/message", json={"text": SCAM}, headers=h)
    assert client.get(f"{API}/analyses", headers=h).json() == []

    r = client.patch(f"{API}/profiles/me", json={"store_history": True}, headers=h)
    assert r.json()["store_history"] is True and r.json()["store_excerpts"] is False
    r = client.post(f"{API}/analyze/message", json={"text": SCAM}, headers=h)
    assert r.json()["stored"] is True
    items = client.get(f"{API}/analyses", headers=h).json()
    assert len(items) == 1 and items[0]["redacted_excerpt"] is None  # no text without separate opt-in

    client.patch(f"{API}/profiles/me", json={"store_excerpts": True}, headers=h)
    client.post(f"{API}/analyze/message", json={"text": "Your OTP is 123456, share it with me"}, headers=h)
    latest = client.get(f"{API}/analyses", headers=h).json()[0]
    assert "123456" not in latest["redacted_excerpt"]

    assert client.delete(f"{API}/analyses/{latest['id']}", headers=h).status_code == 204
    assert len(client.get(f"{API}/analyses", headers=h).json()) == 1
    assert client.delete(f"{API}/analyses", headers=h).status_code == 204
    assert client.get(f"{API}/analyses", headers=h).json() == []


def test_export_and_delete_profile(client, profile):
    h = profile["headers"]
    exp = client.get(f"{API}/profiles/me/export", headers=h).json()
    assert exp["profile"]["display_name"] == "Asha"
    assert client.delete(f"{API}/profiles/me", headers=h).status_code == 204
    assert client.get(f"{API}/profiles/me", headers=h).status_code == 401


def _invite(client, h, name="Ravi"):
    r = client.post(f"{API}/contacts", json={"name": name, "relationship_label": "Son"}, headers=h)
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "pending"
    token = body["invite_url"].split("#t=")[1]
    return body["id"], {"X-Guardian-Token": token}


def test_full_consent_and_alert_flow(client, profile):
    h = profile["headers"]
    cid, g = _invite(client, h)

    info = client.get(f"{API}/guardian/invite", headers=g).json()
    assert info["requester_name"] == "Asha" and info["status"] == "pending"
    assert any("not" in x.lower() or "access" in x.lower() for x in info["what_you_will_not_receive"])

    # Alerts can't reach a contact who hasn't consented yet.
    ticket = client.post(f"{API}/analyze/message", json={"text": SCAM}, headers=h).json()["alert_ticket"]
    r = client.post(f"{API}/alerts", json={"alert_ticket": ticket, "contact_ids": [cid]}, headers=h).json()
    assert r["sent_to"] == [] and r["skipped"][0]["reason"] == "contact_pending"
    assert client.get(f"{API}/guardian/alerts", headers=g).status_code == 403

    assert client.post(f"{API}/guardian/accept", headers=g).json()["status"] == "active"
    assert client.post(f"{API}/guardian/accept", headers=g).status_code == 409

    r = client.post(f"{API}/alerts", json={"alert_ticket": ticket, "contact_ids": [cid], "note": "Is this real?"},
                    headers=h).json()
    assert r["sent_to"] == [cid]
    inbox = client.get(f"{API}/guardian/alerts", headers=g).json()
    assert inbox["alerts"][0]["risk_level"] == "high"
    assert inbox["alerts"][0]["redacted_excerpt"] is None  # excerpt only when explicitly included
    assert inbox["alerts"][0]["note"] == "Is this real?"

    client.post(f"{API}/alerts", json={"alert_ticket": ticket, "contact_ids": [cid], "include_excerpt": True}, headers=h)
    alerts = client.get(f"{API}/guardian/alerts", headers=g).json()["alerts"]
    with_excerpt = [a for a in alerts if a["redacted_excerpt"]]
    assert with_excerpt and "sbi-verify" in with_excerpt[0]["redacted_excerpt"]

    ack = client.post(f"{API}/guardian/alerts/{alerts[0]['id']}/ack", headers=g).json()
    assert ack["acknowledged_at"]

    # The contact withdraws consent: no more alerts, inbox closed.
    assert client.post(f"{API}/guardian/decline", headers=g).status_code == 204
    r = client.post(f"{API}/alerts", json={"alert_ticket": ticket, "contact_ids": [cid]}, headers=h).json()
    assert r["skipped"][0]["reason"] == "contact_revoked"
    assert client.get(f"{API}/guardian/alerts", headers=g).status_code == 403

    events = client.get(f"{API}/profiles/me/export", headers=h).json()["trusted_contacts"][0]["consent_events"]
    assert [e["event"] for e in events][:2] == ["invite_created", "consent_given"]
    assert events[-1]["event"] == "consent_withdrawn"


def test_user_can_revoke_contact(client, profile):
    h = profile["headers"]
    cid, g = _invite(client, h)
    client.post(f"{API}/guardian/accept", headers=g)
    assert client.delete(f"{API}/contacts/{cid}", headers=h).status_code == 204
    assert client.get(f"{API}/contacts", headers=h).json()[0]["status"] == "revoked"
    assert client.get(f"{API}/guardian/alerts", headers=g).status_code == 403


def test_contact_can_decline_invite(client, profile):
    cid, g = _invite(client, profile["headers"])
    assert client.post(f"{API}/guardian/decline", headers=g).status_code == 204
    assert client.post(f"{API}/guardian/accept", headers=g).status_code == 409


def test_forged_or_foreign_tickets_rejected(client, profile):
    h = profile["headers"]
    cid, g = _invite(client, h)
    client.post(f"{API}/guardian/accept", headers=g)
    ticket = client.post(f"{API}/analyze/message", json={"text": SCAM}, headers=h).json()["alert_ticket"]
    raw, sig = ticket.split(".")
    tampered = raw[:-2] + ("AA" if raw[-2:] != "AA" else "BB") + "." + sig
    assert client.post(f"{API}/alerts", json={"alert_ticket": tampered, "contact_ids": [cid]}, headers=h).status_code == 400

    other = client.post(f"{API}/profiles", json={"display_name": "Mallory"}).json()
    foreign = sign_ticket({"s": 99, "l": "high", "c": [], "x": "", "p": other["id"]})
    assert client.post(f"{API}/alerts", json={"alert_ticket": foreign, "contact_ids": [cid]}, headers=h).status_code == 403


def test_other_profiles_cannot_touch_contacts(client, profile):
    cid, _ = _invite(client, profile["headers"])
    other = client.post(f"{API}/profiles", json={"display_name": "Mallory"}).json()
    oh = {"Authorization": f"Bearer {other['token']}"}
    assert client.delete(f"{API}/contacts/{cid}", headers=oh).status_code == 404
    assert client.get(f"{API}/contacts", headers=oh).json() == []


def test_contact_limit(client, profile):
    for i in range(5):
        _invite(client, profile["headers"], f"C{i}")
    r = client.post(f"{API}/contacts", json={"name": "Six"}, headers=profile["headers"])
    assert r.status_code == 409


def test_alert_rate_limit(client, profile, monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "alert_limit_per_hour", 2)
    h = profile["headers"]
    cid, g = _invite(client, h)
    client.post(f"{API}/guardian/accept", headers=g)
    ticket = client.post(f"{API}/analyze/message", json={"text": SCAM}, headers=h).json()["alert_ticket"]
    codes = [client.post(f"{API}/alerts", json={"alert_ticket": ticket, "contact_ids": [cid]}, headers=h).status_code
             for _ in range(3)]
    assert codes == [200, 200, 429]


def test_invalid_guardian_token(client):
    assert client.get(f"{API}/guardian/invite", headers={"X-Guardian-Token": "bogus"}).status_code == 404
    assert client.get(f"{API}/guardian/invite").status_code == 401


def test_model_card(client):
    body = client.get(f"{API}/meta/model-card").json()
    assert body["message_model"]["dataset"].startswith("SMS Spam Collection")
    assert len(body["tactic_categories"]) >= 10
