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


# ---------- M2: a single tactic cannot reach high on its own ----------

COURIER_OTP = ("Your Bluedart shipment 88123 arrives today. Please share OTP 7731 with the delivery executive "
               "at the time of delivery.")
NEW_LOGIN = ("New login to your Axis Mobile app on a Samsung phone at 10:05 today. If it was not you, call the "
             "number on the back of your card to lock your account.")
LPG = "Your Indane LPG refill booking no 22871 is confirmed. Delivery expected in 48 hours. Pay Rs 903 to the delivery person."
CLEAR_SCAM = ("Your PhonePe wallet is suspended due to incomplete KYC. Verify immediately at "
              "http://phonepe-kyc-help.example/verify and share the OTP to restore it.")
MULTI_STAGE = ["Dear customer, you have won a cashback of Rs 5,000 from Paytm.",
               "To claim the cashback scan the QR and enter your UPI PIN to receive the amount.",
               "Hurry, offer expires in 10 minutes. Do not tell anyone."]


def test_legitimate_courier_otp_is_not_high_and_is_sent_for_review():
    a = case(COURIER_OTP)
    assert codes(a) == {"secret_request"}
    assert a["risk_level"] == "medium" and a["risk_score"] == 59
    assert a["review_required"]
    assert any("single tactic cannot make a case high" in r for r in a["uncertainty"]["reasons"])


def test_new_login_notification_is_not_high():
    a = case(NEW_LOGIN)
    assert a["risk_level"] != "high"
    assert a["risk_score"] < 60


def test_lpg_booking_is_low():
    a = case(LPG)
    assert a["risk_level"] == "low" and not a["review_required"]


def test_clear_scam_stays_high():
    a = case(CLEAR_SCAM)
    assert a["risk_level"] == "high" and a["risk_score"] >= 80
    assert {"secret_request", "credential_link", "kyc_suspension"} <= codes(a)


def test_multi_stage_scam_stays_high():
    a = case(*MULTI_STAGE)
    assert a["risk_level"] == "high" and a["risk_score"] >= 90
    assert len(a["stages_observed"]) >= 3
    assert not any("single tactic cannot" in r for r in a["uncertainty"]["reasons"])


def test_corroboration_restores_high():
    # The same bare OTP request is medium alone, and high once a second tactic supports it.
    alone = case("Send me the OTP you just received, it came to you by mistake.")
    assert alone["risk_level"] == "medium" and alone["review_required"]
    backed = case("Send me the OTP you just received, it came to you by mistake. Do not tell anyone about this.")
    assert backed["risk_level"] == "high"


def test_cap_never_raises_and_never_drops_below_medium():
    a = case("Approve the collect request in your UPI app to receive your refund.")
    assert len(a["tactics"]) == 1 and a["risk_level"] == "medium"
    b = case("Urgent: act now.")
    assert b["risk_level"] == "low" and not any("single tactic cannot" in r for r in b["uncertainty"]["reasons"])
