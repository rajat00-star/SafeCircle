"""Scam DNA engine: tactics, case assessment, ordering, observed vs inferred, redaction.

Messages here are written by the project team to exercise specific behaviour. They are
regression tests, not a benchmark (see evaluation/scam_dna for the scenario evaluation).
"""
from datetime import datetime, timedelta, timezone

from app.scamdna.alerts import decide_alert
from app.scamdna.assessment import SCORE_LABEL, assess_case, event_data_quality, explain_change, serialize_detection
from app.scamdna.evidence import extract_indicators, redact_evidence
from app.scamdna.tactics import detect_text, detect_url

BENIGN = ("HDFC Bank: Rs 1,250.00 debited from A/c XX4821 on 11-Oct to UPI merchant FOODCOURT. "
          "Not you? Call the number on the back of your card. Never share your OTP or PIN with anyone.")
CHAIN = [
    "Dear SBI customer, your KYC is pending. Your account will be blocked today.",
    "Update now at http://sbi-kyc-update.example/kyc/login to avoid suspension.",
    "Caller from the SBI fraud team asked me to share the OTP sent to my phone to stop the block.",
    "Approve the collect request of Rs 4,999 in your UPI app to confirm your identity. Pay to demo-kycdesk@ybl.",
]


def ev(i, text, kind="message", observed_at=None, ocr=None):
    det = detect_url(text) if kind == "url" else detect_text(text)
    q = event_data_quality(kind, det.text_length, ocr)
    ser = serialize_detection(det, redact_evidence, q, extract_indicators(text, det.urls, det.claimed_orgs))
    return {"id": f"ev{i}", "seq": i, "kind": kind, "channel": "sms", "observed_at": observed_at,
            "excerpt": redact_evidence(text), "detection": ser}


def codes(a):
    return {t["code"] for t in a["tactics"]}


def test_benign_notification_is_low_and_not_reviewed():
    a = assess_case([ev(1, BENIGN)])
    assert a["risk_level"] == "low"
    assert not a["review_required"]
    assert "secret_request" not in codes(a)
    assert a["score_label"] == SCORE_LABEL and "not a calibrated probability" in a["score_label"]


def test_single_stage_otp_scam():
    a = assess_case([ev(1, "This is the HDFC fraud team. Share the OTP you just received to cancel the transaction.")])
    assert "secret_request" in codes(a)
    assert a["risk_level"] in ("medium", "high")
    assert a["primary_action"].startswith("Do not share any code")


def test_multi_stage_escalation_grows_the_chain_and_explains_why():
    events, prev, scores = [], None, []
    for i, text in enumerate(CHAIN, 1):
        events.append(ev(i, text))
        a = assess_case(events)
        change = explain_change(prev, a, i)
        assert change["explanation"], "every step must explain itself"
        scores.append(a["risk_score"])
        prev = a
    assert scores == sorted(scores) and scores[-1] >= 90
    assert a["stages_observed"] == ["hook", "pressure", "harvest", "extraction"]
    assert {"kyc_suspension", "credential_link", "secret_request", "upi_collect"} <= codes(a)
    assert any(c["kind"] == "stage_bonus" for c in a["components"])
    assert "UPI collect" in " ".join(change["explanation"]) or "Extraction" in " ".join(change["explanation"])


def test_repeating_evidence_does_not_raise_risk():
    a1 = assess_case([ev(1, CHAIN[0])])
    a2 = assess_case([ev(1, CHAIN[0]), ev(2, "Reminder: your SBI account will be blocked today.")])
    ch = explain_change(a1, a2, 2)
    assert a2["risk_level"] == a1["risk_level"]
    assert not ch["added_tactics"] or all(t["severity"] < 0.3 for t in ch["added_tactics"])


def test_missing_evidence_is_reported_for_an_early_stage_case():
    a = assess_case([ev(1, CHAIN[0])])
    assert any("No request for codes" in m for m in a["missing_evidence"])
    assert any("SBI" in m for m in a["missing_evidence"])


def test_conflicting_evidence_triggers_review():
    a = assess_case([ev(1, BENIGN), ev(2, "HDFC Bank: share the OTP you received to reverse the debit.")])
    assert a["conflicts"]
    assert a["review_required"] and "Conflicting evidence" in a["review_reasons"]
    assert a["uncertainty"]["level"] == "high"


def test_order_uses_reported_times_only_when_all_known():
    t0 = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
    e1 = ev(1, CHAIN[2], observed_at=(t0 + timedelta(hours=2)).isoformat())
    e2 = ev(2, CHAIN[0], observed_at=t0.isoformat())
    a = assess_case([e1, e2])
    assert a["order"]["basis"] == "reported_time" and a["order"]["known"]
    assert a["order"]["sequence"] == ["ev2", "ev1"]
    assert "differs from the order" in a["order"]["note"]

    a = assess_case([ev(1, CHAIN[2]), ev(2, CHAIN[0])])
    assert a["order"]["basis"] == "submission_order" and not a["order"]["known"]
    seq_edges = [e for e in a["chain"]["edges"] if e["kind"] == "sequence"]
    assert all(e["basis"] == "submission_order" for e in seq_edges)

    a = assess_case([ev(1, CHAIN[2]), ev(2, CHAIN[0], observed_at=t0.isoformat())])
    assert a["order"]["basis"] == "mixed" and not a["order"]["known"]


def test_observed_and_inferred_are_distinguished():
    a = assess_case([ev(1, CHAIN[0]), ev(2, CHAIN[1]), ev(3, "Update now at http://sbi-kyc-update.example/kyc/login quickly")])
    edges = a["chain"]["edges"]
    assert all(e["basis"] == "observed" for e in edges if e["kind"] == "evidence" and not e["to"].endswith("repeated_indicator"))
    prog = [e for e in edges if e["kind"] == "progression"]
    assert prog and all(e["basis"] == "inferred" for e in prog)
    rep = next(n for n in a["chain"]["nodes"] if n.get("code") == "repeated_indicator")
    assert rep["basis"] == "inferred"
    events = [n for n in a["chain"]["nodes"] if n["type"] == "event"]
    assert all(n["basis"] == "observed" and n["observed_at"] is None for n in events)  # no invented timestamps


def test_model_only_signal_requests_review_without_changing_score():
    det = {"tactics": [], "event_score": 0, "urls": [], "ml_probability": 0.97, "safety_advice": [],
           "claimed_orgs": [], "data_quality": {"level": "good", "notes": []}, "indicators": {}}
    a = assess_case([{"id": "x", "seq": 1, "kind": "message", "channel": "sms", "observed_at": None,
                      "excerpt": "free entry win tkts txt now", "detection": det}])
    assert a["risk_score"] == 0
    assert a["review_required"] and a["uncertainty"]["level"] == "high"
    assert a["model_signal"]["max_probability"] == 0.97


def test_poor_ocr_quality_lowers_certainty():
    a = assess_case([ev(1, CHAIN[2], kind="screenshot", ocr=30.0)])
    assert a["data_quality"]["level"] == "poor"
    assert a["review_required"]


def test_upi_collect_and_negated_advice():
    assert "upi_collect" in detect_text("To receive the refund, enter your UPI PIN and approve the request.").tactics
    advice = detect_text("Remember: never enter your UPI PIN to receive money. You only need it to pay.")
    assert "upi_collect" not in advice.tactics and "secret_request" not in advice.tactics


def test_digital_arrest_and_payment_diversion():
    d = detect_text("You are under digital arrest. Stay on the video call. Transfer your savings to the RBI safe account.")
    assert {"digital_arrest", "payment_diversion"} <= set(d.tactics)


def test_redaction_removes_secrets_and_keeps_links_without_query():
    raw = ("Your OTP is 123456 and PIN: 4455. Call +91 98765 43210 or mail a.b@gmail.com. Card 4111 1111 1111 1111. "
           "Pay to someone@ybl at http://sbi-kyc.example/login?user=abc@x.com&t=9")
    r = redact_evidence(raw)
    for secret in ("123456", "4455", "98765", "a.b@gmail.com", "4111", "someone@ybl", "user=abc"):
        assert secret not in r
    assert "http://sbi-kyc.example/login?[query removed]" in r
    ind = extract_indicators(raw, detect_text(raw).urls, ["sbi"])
    assert ind["upi_handles"] and all(len(h) == 24 for h in ind["upi_handles"])  # keyed hashes, not values
    assert ind["upi_handles_masked"] == ["so***@ybl"]


def test_alert_decisions():
    def a(level, tactics, fp, review=False):
        return {"risk_level": level, "review_required": review, "fingerprint": fp,
                "tactics": [{"code": c, "title": c, "severity": s} for c, s in tactics]}
    assert decide_alert(None, a("low", [], "f0")).action == "none"
    first = decide_alert(None, a("medium", [("kyc_suspension", 0.35)], "f1"))
    assert first.action == "new" and first.notify
    last = {"fingerprint": "f1", "risk_level": "medium", "tactics": ["kyc_suspension"]}
    assert decide_alert(last, a("medium", [("kyc_suspension", 0.35)], "f1")).action == "suppressed"
    assert decide_alert(last, a("medium", [("kyc_suspension", 0.35), ("urgency", 0.15)], "f2")).action == "suppressed"
    up = decide_alert(last, a("medium", [("kyc_suspension", 0.35), ("remote_access", 0.55)], "f3"))
    assert up.action == "updated" and up.notify
    assert decide_alert(last, a("high", [("secret_request", 0.6)], "f4")).action == "escalated"
    assert decide_alert({**last, "risk_level": "high"}, a("medium", [], "f5")).action == "deescalated"
    assert decide_alert(None, a("low", [], "f6", review=True)).action == "new"
