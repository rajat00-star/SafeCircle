"""UPI Scam Guard: parsing, signals, case matching, attachment to a case, and malformed input."""
import pytest

from app.scamdna.upi import UpiParseError, detect_upi, parse_upi

API = "/api/v1"
SCAM_QR = "upi://pay?pa=sbi.refund@ybl&pn=SBI%20Refund%20Desk&am=4999&cu=INR&tn=Scan%20to%20receive%20your%20refund"


def test_parse_bare_handle_and_link():
    p = parse_upi("  Asha.K@okaxis ")
    assert (p.kind, p.handle, p.masked, p.psp_known) == ("handle", "asha.k@okaxis", "as***@okaxis", True)
    q = parse_upi(SCAM_QR)
    assert q.kind == "upi_link" and q.link_type == "pay"
    assert (q.payee_name, q.amount, q.currency) == ("SBI Refund Desk", "4999.00", "INR")
    assert q.note == "Scan to receive your refund"


@pytest.mark.parametrize("bad", ["", "not a upi id", "a@", "@ybl", "upi://pay?pn=NoPayee",
                                 "upi://pay?pa=x@ybl&am=-5", "upi://pay?pa=x@ybl&am=abc",
                                 "upi://pay?pa=x@ybl&am=1.234", "upi://pay?pa=bad handle@ybl", "x" * 3000])
def test_malformed_input_is_rejected_with_a_reason(bad):
    with pytest.raises(UpiParseError):
        parse_upi(bad)


def test_pay_to_receive_qr_is_flagged_with_observed_evidence():
    det, signals = detect_upi(parse_upi(SCAM_QR), "")
    codes = {s["code"] for s in signals}
    assert {"prefilled_amount", "pay_to_receive", "lure_name", "org_name"} <= codes
    assert "upi_collect" in det.tactics and "reward_lure" in det.tactics
    basis = {s["code"]: s["basis"] for s in signals}
    assert basis["pay_to_receive"] == "observed" and basis["org_name"] == "heuristic"


def test_ordinary_merchant_qr_has_no_tactics():
    det, signals = detect_upi(parse_upi("upi://pay?pa=ravistores@okicici&pn=Ravi%20Stores&am=120"), "")
    assert det.tactics == {}
    assert [s["code"] for s in signals] == ["prefilled_amount"]


def test_merchant_named_in_own_handle_is_not_impersonation():
    det, signals = detect_upi(parse_upi("upi://pay?pa=amazon@apl&pn=Amazon"), "")
    assert "authority_impersonation" not in det.tactics
    assert not any(s["code"] == "org_name" for s in signals)


def test_support_style_handle_naming_a_bank_is_flagged():
    det, signals = detect_upi(parse_upi("hdfc.customer.care@ybl"), "")
    assert "authority_impersonation" in det.tactics and any(s["code"] == "org_name" for s in signals)


def test_unlisted_suffix_is_informational_only():
    det, signals = detect_upi(parse_upi("someone@newbank"), "")
    assert any(s["code"] == "unlisted_psp" for s in signals) and det.tactics == {}


def test_api_benign_handle_is_low_with_honest_verdict(client):
    r = client.post(f"{API}/upi/check", json={"input": "asha@okaxis"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["risk_level"] == "low" and d["stored"] is False
    assert "does not confirm" in d["verdict"]
    assert d["parsed"]["handle_masked"] == "as***@okaxis" and "asha@okaxis" not in r.text
    assert any("cannot see who owns" in x for x in d["limitations"])


def test_api_scam_qr_with_message_is_high(client):
    ctx = "Dear customer, SBI has approved your refund. Scan the QR and enter your UPI PIN to receive it within 10 minutes."
    r = client.post(f"{API}/upi/check", json={"input": SCAM_QR, "context": ctx})
    d = r.json()
    assert r.status_code == 200 and d["risk_level"] == "high"
    assert {"upi_collect", "reward_lure"} <= {t["code"] for t in d["tactics"]}
    assert "probability" in d["score_label"].lower()


def test_api_malformed_returns_422_with_message(client):
    r = client.post(f"{API}/upi/check", json={"input": "upi://pay?pa=xy@ybl&am=-1"})
    assert r.status_code == 422 and "amount" in r.json()["detail"]
    assert client.post(f"{API}/upi/check", json={"input": "ab"}).status_code == 422


def test_handle_seen_in_a_risky_case_is_reported(client, profile):
    h = profile["headers"]
    case = client.post(f"{API}/cases", json={"title": "Refund scam"}, headers=h).json()
    client.post(f"{API}/cases/{case['id']}/events", headers=h, json={
        "kind": "message", "content": "Your SBI KYC is pending, account blocked today. Pay the fee to sbi.refund@ybl now and share the OTP."})
    r = client.post(f"{API}/upi/check", json={"input": "SBI.Refund@ybl"}, headers=h).json()
    assert [m["case_id"] for m in r["case_matches"]] == [case["id"]]
    assert any(s["code"] == "seen_in_cases" for s in r["signals"])
    # Without a profile nothing from anyone's cases is consulted.
    anon = client.post(f"{API}/upi/check", json={"input": "sbi.refund@ybl"}).json()
    assert anon["case_matches"] == []


def test_attach_to_case_stores_masked_handle_and_reassesses(client, profile):
    h = profile["headers"]
    case = client.post(f"{API}/cases", json={"title": "QR"}, headers=h).json()
    r = client.post(f"{API}/upi/check", json={"input": SCAM_QR, "case_id": case["id"]}, headers=h)
    d = r.json()
    assert d["stored"] and d["case_update"]["event_added"]
    detail = client.get(f"{API}/cases/{case['id']}", headers=h).json()
    ev = detail["events"][0]
    assert ev["channel"] == "upi_app" and "sb***@ybl" in ev["excerpt"] and "sbi.refund@ybl" not in ev["excerpt"]
    assert detail["assessment"]["indicators"]["upi_handles"]
    # Same check again is a duplicate and does not raise a second alert.
    again = client.post(f"{API}/upi/check", json={"input": SCAM_QR, "case_id": case["id"]}, headers=h).json()
    assert again["case_update"]["duplicate"] and again["case_update"]["alert"]["action"] == "suppressed"


def test_attach_requires_profile_and_ownership(client, profile):
    case = client.post(f"{API}/cases", json={"title": "x"}, headers=profile["headers"]).json()
    assert client.post(f"{API}/upi/check", json={"input": "a1@ybl", "case_id": case["id"]}).status_code == 401
    other = client.post(f"{API}/profiles", json={"display_name": "B"}).json()
    r = client.post(f"{API}/upi/check", json={"input": "a1@ybl", "case_id": case["id"]},
                    headers={"Authorization": f"Bearer {other['token']}"})
    assert r.status_code == 404
