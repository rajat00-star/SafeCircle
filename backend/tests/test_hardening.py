"""Development regression suite for the hardening fixes (findings M1-M3 in docs/validation-report.md).

Messages here were written for this suite (DEMO DATA). They are not taken from the frozen holdout sets
(evaluation/holdout_v2, evaluation/holdout_v3), which were not used to tune anything.
"""
from app.scamdna.assessment import assess_case
from app.scamdna.tactics import detect_text

from test_scamdna_engine import codes, ev

PIN_LINK = "Kotak alert: confirm your net banking password at http://kotak-secure-check.example/login to avoid suspension."


def case(*texts):
    return assess_case([ev(i + 1, t) for i, t in enumerate(texts)])


# ---------- M3: contradicting follow-ups ----------

def test_retraction_after_a_request_is_a_conflict_and_never_lowers_risk():
    before = case(PIN_LINK)
    after = case(PIN_LINK, "Please ignore the previous message. Kotak never asks for your password or OTP.")
    assert after["risk_score"] >= before["risk_score"]
    assert after["risk_level"] == before["risk_level"] == "high"
    assert after["review_required"] and "Conflicting evidence" in after["review_reasons"]
    note = next(c for c in after["conflicts"] if "ignore an earlier message" in c)
    assert "Event #2" in note and "event #1" in note and "newer" in note
    # Provenance: both events and the original request stay in the case.
    assert len(after["chain"]["nodes"]) >= 2 and "credential_link" in codes(after)


def test_retraction_that_makes_its_own_request_is_called_out():
    a = case("Share the OTP you just received to complete verification.",
             "Kindly disregard the earlier SMS. Enter your UPI PIN on the new request to receive your refund.")
    note = next(c for c in a["conflicts"] if "ignore an earlier message" in c)
    assert "itself also makes a request" in note
    assert a["review_required"] and a["risk_level"] == "high"


def test_safety_advice_after_any_risky_request_is_a_conflict():
    # A remote-access request followed by reassurance: not covered by the original OTP/collect-only rule.
    a = case("Install AnyDesk so our engineer can fix your banking app.",
             "Relax, this is official support. We never ask you to share your OTP.")
    assert any("reassures you with safety advice" in c for c in a["conflicts"])
    assert a["review_required"]


def test_retraction_without_an_earlier_request_is_not_a_conflict():
    a = case("Your electricity bill of Rs 1,120 is generated. Due date 20-Oct.",
             "Please ignore the earlier message, it had the wrong due date. The correct date is 22-Oct.")
    assert a["conflicts"] == []
    assert a["risk_level"] == "low" and not a["review_required"]


def test_genuine_notice_followed_by_safety_reminder_is_not_a_conflict():
    a = case("Your recurring deposit instalment of Rs 3,000 was debited on 05-Oct.",
             "Reminder: we never ask for your OTP or PIN on calls or SMS.")
    assert a["conflicts"] == []
    assert a["risk_level"] == "low"


def test_retraction_is_recorded_on_the_event_but_adds_no_tactic():
    d = detect_text("Please disregard my last message.")
    assert d.retraction and not d.tactics


def test_retraction_conflict_survives_storage_through_the_api(client, profile):
    h = profile["headers"]
    cid = client.post("/api/v1/cases", headers=h, json={"title": "DEMO DATA retraction"}).json()["id"]
    for text in (PIN_LINK, "Please ignore the previous message, it was sent in error."):
        assert client.post(f"/api/v1/cases/{cid}/events", headers=h,
                           json={"kind": "message", "content": text}).status_code == 200
    c = client.get(f"/api/v1/cases/{cid}", headers=h).json()
    assert c["review_required"] and c["risk_level"] == "high"
    assert any("ignore an earlier message" in x for x in c["assessment"]["conflicts"])
    assert len(c["events"]) == 2
