"""DEMO DATA: synthetic scenarios for the hackathon demonstration.

Everything here was written by the SafeCircle team. None of it is a real message, a real
victim, a verified attack or live threat intelligence. Domains use the reserved `.example`
top-level domain and UPI handles start with "demo", so none of them can belong to anyone.

Fixtures carry *expected* outcomes so the demo (and the tests) can check that the live
engine reproduces them. The engine always analyses the fixture text fresh; results are
never replayed from this file.
"""
from __future__ import annotations

DEMO_LABEL = "DEMO DATA: synthetic scenario written by the SafeCircle team. Not a real message or a real victim."

SCENARIOS: list[dict] = [
    {
        "key": "benign_bank",
        "title": "Benign bank debit notification",
        "summary": "A genuine-style transaction alert with safety advice and no request.",
        "expected": {"risk_level": "low", "review_required": False, "tactics_include": [], "tactics_exclude": ["secret_request"]},
        "events": [
            {"kind": "message", "channel": "sms", "note": "Transaction alert",
             "content": "HDFC Bank: Rs 1,250.00 debited from A/c XX4821 on 11-Oct to UPI merchant FOODCOURT. "
                        "Not you? Call the number on the back of your card. Never share your OTP or PIN with anyone."},
        ],
    },
    {
        "key": "kyc_suspension",
        "title": "Fake KYC / account suspension",
        "summary": "A suspension threat followed by a look-alike KYC link.",
        "expected": {"risk_level": "high", "review_required": False,
                     "tactics_include": ["kyc_suspension", "credential_link"]},
        "events": [
            {"kind": "message", "channel": "sms", "note": "Suspension threat",
             "content": "Dear SBI customer, your KYC has expired and your account will be blocked within 24 hours."},
            {"kind": "url", "channel": "sms", "note": "Link from the same sender",
             "content": "http://sbi-kyc-update.example/kyc/verify"},
        ],
    },
    {
        "key": "upi_collect",
        "title": "UPI collect-request manipulation",
        "summary": "A cashback lure that turns into a collect request needing the UPI PIN.",
        "expected": {"risk_level": "high", "review_required": False, "tactics_include": ["reward_lure", "upi_collect"]},
        "events": [
            {"kind": "message", "channel": "whatsapp", "note": "Lure",
             "content": "Congratulations! You have won Rs 5,000 cashback from PhonePe Rewards."},
            {"kind": "message", "channel": "whatsapp", "note": "Collect request",
             "content": "To receive the cashback, approve the collect request of Rs 4,999 in your UPI app and enter "
                        "your UPI PIN. Offer expires in 10 minutes."},
        ],
    },
    {
        "key": "multi_stage",
        "title": "Multi-stage bank impersonation with a suspicious link",
        "summary": "Four messages escalate from a KYC threat to a login link, an OTP request and a payment to a UPI handle.",
        "expected": {"risk_level": "high", "review_required": False,
                     "tactics_include": ["kyc_suspension", "credential_link", "secret_request", "upi_collect"]},
        "events": [
            {"kind": "message", "channel": "sms", "note": "Opening threat",
             "content": "Dear SBI customer, your KYC is pending. Your account will be blocked today."},
            {"kind": "message", "channel": "sms", "note": "Login link",
             "content": "Update now at http://sbi-kyc-update.example/kyc/login to avoid suspension."},
            {"kind": "message", "channel": "call", "note": "Caller asks for the OTP",
             "content": "Caller said he was from the SBI fraud team and asked me to share the OTP sent to my phone to stop the block."},
            {"kind": "message", "channel": "upi_app", "note": "Payment step",
             "content": "Approve the collect request of Rs 4,999 in your UPI app to confirm your identity. Pay to demo-kycdesk@ybl."},
        ],
    },
    {
        "key": "digital_arrest",
        "title": "Coercive digital arrest with remote access",
        "summary": "Fake police and customs pressure, a demand to stay on a video call, remote access and a 'safe account' transfer.",
        "expected": {"risk_level": "high", "review_required": False,
                     "tactics_include": ["digital_arrest", "remote_access", "payment_diversion"]},
        "events": [
            {"kind": "message", "channel": "call", "note": "Authority claim",
             "content": "This is an officer from Mumbai Crime Branch. A parcel with drugs in your name was seized by customs. "
                        "A money laundering case is registered against your Aadhaar."},
            {"kind": "message", "channel": "whatsapp", "note": "Coercion and remote access",
             "content": "You are under digital arrest. Stay on the video call and do not tell anyone. Install AnyDesk so "
                        "our officer can verify your bank account."},
            {"kind": "message", "channel": "whatsapp", "note": "Money extraction",
             "content": "Transfer your savings to the RBI safe account for verification. Pay to demo-rbi-vault@ybl. "
                        "It will be refunded after the investigation."},
        ],
    },
]

# Synthetic cases that form plausible campaigns for Campaign Radar.
CAMPAIGN_CASES: list[dict] = [
    {"key": "kyc_a", "title": "KYC suspension SMS (A)", "events": [
        ("message", "sms", "SBI: Dear customer, your KYC is pending and your account will be blocked today. "
                           "Update at http://sbi-kyc-update.example/kyc/verify/2231 immediately.")]},
    {"key": "kyc_b", "title": "KYC suspension SMS (B)", "events": [
        ("message", "sms", "Dear SBI user, KYC not updated. Account will be suspended in 24 hours. "
                           "Verify now: http://sbi-kyc-update.example/kyc/verify/8812")]},
    {"key": "kyc_c", "title": "KYC suspension SMS (C, different domain)", "events": [
        ("message", "sms", "SBI: Dear customer, your KYC is pending and your account will be blocked today. "
                           "Update at http://sbi-kyc-renew.example/kyc/verify/5520 immediately.")]},
    {"key": "arrest_a", "title": "Digital arrest call (A)", "events": [
        ("message", "call", "Officer from Crime Branch said a parcel with drugs in my name was seized and I am under "
                            "digital arrest. He told me to stay on the video call and not tell anyone."),
        ("message", "whatsapp", "Transfer your savings to the RBI safe account for verification. Pay to demo-rbi-vault@ybl.")]},
    {"key": "arrest_b", "title": "Digital arrest call (B)", "events": [
        ("message", "call", "Caller claimed to be from the CBI. A money laundering case is registered against my Aadhaar. "
                            "I must stay on the video call."),
        ("message", "whatsapp", "For verification move the full amount to the RBI safe account. Pay to demo-rbi-vault@ybl now.")]},
    {"key": "cashback_a", "title": "Cashback collect request (A)", "events": [
        ("message", "whatsapp", "Congratulations! You have won Rs 5,000 cashback. To receive the cashback, approve the "
                                "collect request in your UPI app and enter your UPI PIN.")]},
    {"key": "cashback_b", "title": "Cashback collect request (B)", "events": [
        ("message", "whatsapp", "Congratulations! You have won Rs 2,500 cashback. To receive the cashback, approve the "
                                "collect request in your UPI app and enter your UPI PIN.")]},
    {"key": "parcel", "title": "Parcel redelivery fee (unrelated)", "events": [
        ("message", "sms", "India Post: your parcel is on hold. Pay the redelivery fee of Rs 25 within 12 hours at "
                           "http://parcel-redeliver.example/pay")]},
    {"key": "hdfc_login", "title": "HDFC login page (similar tactics, unrelated)", "events": [
        ("message", "email", "HDFC Bank: unusual sign-in detected. Your account will be suspended. Confirm your login "
                             "details at http://hdfc-secure-login.example/auth to keep access.")]},
    {"key": "benign_otp", "title": "Genuine OTP notification", "events": [
        ("message", "sms", "482913 is your OTP for login. Do not share it with anyone. Bank staff will never ask for your OTP.")]},
]


def scenario(key: str) -> dict | None:
    return next((s for s in SCENARIOS if s["key"] == key), None)


def check_expectation(expected: dict, assessment: dict) -> dict:
    """Compare a live assessment with a fixture's expected outcome."""
    codes = {t["code"] for t in assessment["tactics"]}
    problems = []
    if assessment["risk_level"] != expected["risk_level"]:
        problems.append(f"expected {expected['risk_level']} risk, got {assessment['risk_level']}")
    if assessment["review_required"] != expected["review_required"]:
        problems.append(f"expected review_required={expected['review_required']}")
    missing = [c for c in expected.get("tactics_include", []) if c not in codes]
    if missing:
        problems.append("missing tactics: " + ", ".join(missing))
    extra = [c for c in expected.get("tactics_exclude", []) if c in codes]
    if extra:
        problems.append("unexpected tactics: " + ", ".join(extra))
    return {"matches": not problems, "problems": problems}
