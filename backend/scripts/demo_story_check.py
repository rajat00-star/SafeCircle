"""Dry-run of the hackathon demo story (docs/demo-runbook.md) against a throwaway database.

Runs every API step the demo shows, in order, and checks the outcome the runbook promises. All inputs are
synthetic DEMO DATA. backend/safecircle.db is never opened.

    cd backend && .venv/bin/python scripts/demo_story_check.py
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="safecircle-demo-check-"))
os.environ["SAFECIRCLE_DATABASE_URL"] = f"sqlite:///{_TMP / 'demo.db'}"
os.environ["SAFECIRCLE_SECRET_KEY"] = "demo-story-check-only-secret"
os.environ["SAFECIRCLE_LLM_PROVIDER"] = "none"
os.environ["SAFECIRCLE_LOG_LEVEL"] = "WARNING"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

API = "/api/v1"
# The same DEMO DATA strings the UPI Guard page uses (frontend/app/upi/page.tsx).
DEMO_SHOP = "upi://pay?pa=ravistores@okicici&pn=Ravi%20Stores&am=120&cu=INR"
DEMO_SCAM = "upi://pay?pa=sbi.refund@ybl&pn=SBI%20Refund%20Desk&am=4999&cu=INR&tn=Scan%20to%20receive%20your%20refund"
DEMO_SCAM_MSG = ("Dear customer, SBI has approved your refund of Rs 4999. Scan the QR and enter your UPI PIN to "
                 "receive it within 10 minutes.")
OPENER = "SBI Refund Desk: your refund of Rs 4,999 has been approved and is waiting to be credited."
FOLLOW_UP = "Caller from the SBI refund desk asked me to read out the OTP I just received so he can release the refund."
GUARD_HIGH = "http://sbi-kyc-verify-login.example/update"
GUARD_MEDIUM = "http://free-gift-card-winner.example/claim"
GUARD_LOW = "https://example.com/"

failures = []


def step(n: str, ok: bool, detail: str) -> None:
    print(f"{'PASS' if ok else 'FAIL'}  {n}: {detail}")
    if not ok:
        failures.append(n)


def main() -> None:
    Base.metadata.create_all(engine)
    c = TestClient(app)
    p = c.post(f"{API}/profiles", json={"display_name": "Demo judge"}).json()
    h = {"Authorization": f"Bearer {p['token']}"}

    r = c.post(f"{API}/upi/check", json={"input": DEMO_SHOP}).json()
    step("1 baseline shop QR", r["risk_level"] == "low" and not r["tactics"],
         f"{r['risk_level']} {r['risk_score']}/100, verdict: {r['verdict']}")

    case = c.post(f"{API}/cases", headers=h, json={"title": "DEMO · Refund QR from 'SBI'"}).json()["id"]
    r = c.post(f"{API}/cases/{case}/events", headers=h, json={"kind": "message", "channel": "sms", "content": OPENER}).json()
    step("2 suspicious message starts the case", r["case"]["risk_level"] in ("low", "medium"),
         f"{r['case']['risk_level']} {r['case']['risk_score']}/100, alert: {r['alert']['action']}")

    r = c.post(f"{API}/upi/check", headers=h, json={"input": DEMO_SCAM, "context": DEMO_SCAM_MSG}).json()
    step("3 scam QR in UPI Guard", r["risk_level"] == "high",
         f"{r['risk_level']} {r['risk_score']}/100, tactics: {', '.join(t['code'] for t in r['tactics'])}")

    r = c.post(f"{API}/upi/check", headers=h, json={"input": DEMO_SCAM, "context": DEMO_SCAM_MSG, "case_id": case}).json()
    u = r["case_update"]
    step("4-5 attach to investigation, Scam DNA reassesses", u["event_added"] and u["risk_level"] == "high"
         and u["change"]["changed"] and u["alert"]["notify"],
         f"score {u['change']['score_before']} -> {u['change']['score_after']}, level {u['change']['level_before']} -> "
         f"{u['change']['level_after']}, added: {', '.join(t.get('title', str(t)) if isinstance(t, dict) else t for t in u['change']['added_tactics'])}, alert: {u['alert']['action']}")
    r = c.post(f"{API}/upi/check", headers=h, json={"input": DEMO_SCAM, "context": DEMO_SCAM_MSG, "case_id": case}).json()
    step("5b same check again", r["case_update"]["duplicate"] and not r["case_update"]["alert"]["notify"],
         r["case_update"]["alert"]["reason"])
    r = c.post(f"{API}/cases/{case}/events", headers=h, json={"kind": "message", "channel": "call", "content": FOLLOW_UP}).json()
    step("5c follow-up call, already high", r["case"]["risk_level"] == "high",
         f"alert: {r['alert']['action']} ({r['alert']['reason']})")

    second = c.post(f"{API}/cases", headers=h, json={"title": "DEMO · Same QR, reported by a neighbour"}).json()["id"]
    c.post(f"{API}/upi/check", headers=h, json={"input": DEMO_SCAM, "context": "Neighbour got this QR for a 'refund'.",
                                                  "case_id": second})
    assert c.post(f"{API}/demo/campaigns", headers=h).status_code == 201
    camp = c.get(f"{API}/campaigns", headers=h).json()
    mine = [x for x in camp["campaigns"] if case in x["member_ids"]]
    step("6a Campaign Radar", len(mine) == 1 and any("UPI" in e for e in mine[0]["exact_indicators"]),
         f"{len(camp['campaigns'])} groups; story group: {mine[0]['exact_indicators'] if mine else 'missing'}")
    net = c.get(f"{API}/network", headers=h).json()
    upi = [n for n in net["nodes"] if n.get("kind") == "upi" and n["case_count"] >= 2]
    step("6b Scam Network", bool(upi) and net["stats"]["inferred_edges"] > 0,
         f"shared UPI nodes: {[n['label'] for n in upi]}; observed edges {net['stats']['observed_edges']}, "
         f"inferred edges {net['stats']['inferred_edges']}")

    rep = c.get(f"{API}/cases/{case}/report", headers=h).json()
    md = c.get(f"{API}/cases/{case}/report.md", headers=h).text
    step("7 Evidence report", rep["assessment"]["risk_level"] == "high" and "NOT been submitted" in md
         and "sbi.refund@ybl" not in md and len(rep["timeline"]) == 3,
         f"{len(rep['timeline'])} evidence items, related: {[x['case_title'] for x in rep['related_cases']]}, "
         f"fingerprint {rep['content_sha256'][:12]}")

    levels = [c.post(f"{API}/analyze/url", json={"url": u}).json()["risk_level"] for u in (GUARD_HIGH, GUARD_MEDIUM, GUARD_LOW)]
    step("8 Guardian Shield server verdicts", levels == ["high", "medium", "low"],
         f"high-risk test link {levels[0]}, medium {levels[1]}, safe {levels[2]} (the extension itself is a manual check)")

    print(f"\n{len(failures)} failed" if failures else "\nAll demo steps behave as the runbook says.")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
