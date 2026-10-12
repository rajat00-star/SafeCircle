"""Capture real API output for the presentation site (DEMO DATA only).

Replays the demo story from docs/demo-runbook.md and the synthetic multi-stage scenario through the real
FastAPI app on a throwaway SQLite database, then writes the responses to presentation/site/data/.
backend/safecircle.db is never opened. Re-run after any detector change:

    backend/.venv/bin/python presentation/scripts/snapshot.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_TMP = Path(tempfile.mkdtemp(prefix="safecircle-presentation-"))
os.environ["SAFECIRCLE_DATABASE_URL"] = f"sqlite:///{_TMP / 'snapshot.db'}"
os.environ["SAFECIRCLE_SECRET_KEY"] = "presentation-snapshot-only-secret"
os.environ["SAFECIRCLE_LLM_PROVIDER"] = "none"
os.environ["SAFECIRCLE_LOG_LEVEL"] = "WARNING"
os.environ["SAFECIRCLE_RATE_LIMIT_PER_MINUTE"] = "1000"
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

API = "/api/v1"
OUT = ROOT / "presentation" / "site" / "data"
# Same DEMO DATA strings as backend/scripts/demo_story_check.py and the UPI Guard page.
DEMO_SHOP = "upi://pay?pa=ravistores@okicici&pn=Ravi%20Stores&am=120&cu=INR"
DEMO_SCAM = "upi://pay?pa=sbi.refund@ybl&pn=SBI%20Refund%20Desk&am=4999&cu=INR&tn=Scan%20to%20receive%20your%20refund"
DEMO_SCAM_MSG = ("Dear customer, SBI has approved your refund of Rs 4999. Scan the QR and enter your UPI PIN to "
                 "receive it within 10 minutes.")
OPENER = "SBI Refund Desk: your refund of Rs 4,999 has been approved and is waiting to be credited."
DOUBT = [("message", "SMS · unknown sender", "Hi, I sent a code to your phone by mistake. Please share the OTP you just received."),
         ("message", "SMS · same sender, later", "Please ignore the earlier message. We will never ask for your OTP.")]
FOLLOW_UP = "Caller from the SBI refund desk asked me to read out the OTP I just received so he can release the refund."


def frame(c: TestClient, h: dict, case_id: str, source: str, label: str, text: str, alert: dict, change: dict | None,
          duplicate: bool = False) -> dict:
    """One playback frame for Scene B: the input and the case as the API reports it right after."""
    case = c.get(f"{API}/cases/{case_id}", headers=h).json()
    a = case["assessment"] or {}
    return {
        "input": {"source": source, "label": label, "text": text},
        "duplicate": duplicate, "alert": alert, "change": change,
        "case": {"risk_level": case["risk_level"], "risk_score": case["risk_score"], "review_required": case["review_required"],
                 "event_count": case["event_count"],
                 "tactics": [{k: t[k] for k in ("code", "title", "stage", "severity", "basis")} for t in a.get("tactics", [])],
                 "stages_observed": a.get("stages_observed", []), "components": a.get("components", []),
                 "uncertainty": a.get("uncertainty"), "review_reasons": a.get("review_reasons", []),
                 "conflicts": a.get("conflicts", []), "missing_evidence": a.get("missing_evidence", []),
                 "score_label": a.get("score_label"), "thresholds": a.get("thresholds")},
    }


def main() -> None:
    Base.metadata.create_all(engine)
    c = TestClient(app)
    h = {"Authorization": f"Bearer {c.post(f'{API}/profiles', json={'display_name': 'Presentation snapshot'}).json()['token']}"}
    story = []

    def record(step: str, where: str, did: str, resp: dict, kind: str) -> None:
        story.append({"step": step, "where": where, "did": did, "kind": kind, "response": resp})

    record("1", "UPI Guard", "Check an ordinary shop QR", c.post(f"{API}/upi/check", json={"input": DEMO_SHOP}).json(), "upi")
    case = c.post(f"{API}/cases", headers=h, json={"title": "DEMO · Refund QR from 'SBI'"}).json()["id"]
    frames = []
    r = c.post(f"{API}/cases/{case}/events", headers=h, json={"kind": "message", "channel": "sms", "content": OPENER}).json()
    record("2", "Scam DNA", "Add the opening message to a new case", r, "event")
    frames.append(frame(c, h, case, "message", "SMS · opening message", OPENER, r["alert"], r["change"]))
    record("3", "UPI Guard", "Check the refund QR",
           c.post(f"{API}/upi/check", headers=h, json={"input": DEMO_SCAM, "context": DEMO_SCAM_MSG}).json(), "upi")
    r = c.post(f"{API}/upi/check", headers=h, json={"input": DEMO_SCAM, "context": DEMO_SCAM_MSG, "case_id": case}).json()
    record("4", "UPI Guard", "Attach the QR check to the case", r, "upi")
    frames.append(frame(c, h, case, "upi", "UPI Guard · refund QR attached", "Payee sb***@ybl, Rs 4999, 'Scan to receive your refund'",
                        r["case_update"]["alert"], r["case_update"]["change"], r["case_update"]["duplicate"]))
    r = c.post(f"{API}/upi/check", headers=h, json={"input": DEMO_SCAM, "context": DEMO_SCAM_MSG, "case_id": case}).json()
    record("5a", "UPI Guard", "Run the same check again", r, "upi")
    frames.append(frame(c, h, case, "upi", "UPI Guard · same check again", "The identical QR and message",
                        r["case_update"]["alert"], r["case_update"]["change"], r["case_update"]["duplicate"]))
    r = c.post(f"{API}/cases/{case}/events", headers=h, json={"kind": "message", "channel": "call", "content": FOLLOW_UP}).json()
    record("5b", "Scam DNA", "Add the caller's OTP request", r, "event")
    frames.append(frame(c, h, case, "message", "Call note · OTP request", FOLLOW_UP, r["alert"], r["change"]))
    story_case = c.get(f"{API}/cases/{case}", headers=h).json()

    second = c.post(f"{API}/cases", headers=h, json={"title": "DEMO · Same QR, reported by a neighbour"}).json()["id"]
    c.post(f"{API}/upi/check", headers=h, json={"input": DEMO_SCAM, "context": "Neighbour got this QR for a 'refund'.", "case_id": second})

    # Multi-stage scenario, evidence added one item at a time so every reassessment is visible.
    from app.scamdna.demo import SCENARIOS
    ms = next(s for s in SCENARIOS if s["key"] == "multi_stage")
    ms_case = c.post(f"{API}/cases", headers=h, json={"title": "DEMO · " + ms["title"]}).json()["id"]
    ms_steps = []
    for ev in ms["events"]:
        r = c.post(f"{API}/cases/{ms_case}/events", headers=h,
                   json={"kind": ev["kind"], "channel": ev["channel"], "content": ev["content"]}).json()
        src = "link" if ev["kind"] == "url" else "message"
        ms_steps.append(frame(c, h, ms_case, src, f"{ev['channel'].replace('_', ' ').upper()} · {ev['note']}", ev["content"],
                              r["alert"], r["change"]))
    ms_detail = c.get(f"{API}/cases/{ms_case}", headers=h).json()

    # Doubt: a lone OTP request (single tactic, held at medium) followed by a retraction (conflict -> review).
    doubt_case = c.post(f"{API}/cases", headers=h, json={"title": "DEMO · Lone OTP request, then a retraction"}).json()["id"]
    doubt = []
    for src, label, text in DOUBT:
        r = c.post(f"{API}/cases/{doubt_case}/events", headers=h, json={"kind": "message", "channel": "sms", "content": text}).json()
        doubt.append(frame(c, h, doubt_case, src, label, text, r["alert"], r["change"]))

    assert c.post(f"{API}/demo/campaigns", headers=h).status_code == 201
    network = c.get(f"{API}/network", headers=h).json()
    campaigns = c.get(f"{API}/campaigns", headers=h).json()
    overview = c.get(f"{API}/overview", headers=h).json()

    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    meta = {"label": "DEMO DATA: synthetic scenarios written by the SafeCircle team, run through the real API on a "
                     "throwaway database. Not real victims, not live fraud intelligence.",
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "commit": commit,
            "command": "backend/.venv/bin/python presentation/scripts/snapshot.py"}
    files = {"story.json": {"meta": meta, "steps": story, "frames": frames, "case": story_case},
             "multistage.json": {"meta": meta, "scenario": {k: ms[k] for k in ("key", "title", "summary")},
                                 "steps": ms_steps, "case": ms_detail},
             "doubt.json": {"meta": meta, "frames": doubt},
             "network.json": {"meta": meta, **network},
             "campaigns.json": {"meta": meta, **campaigns},
             "overview.json": {"meta": meta, **overview}}
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (OUT / name).write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    # Also expose the data to file:// and no-fetch environments.
    (OUT / "snapshot.js").write_text("window.SNAPSHOT = " + json.dumps({k[:-5]: v for k, v in files.items()},
                                                                       ensure_ascii=False) + ";\n")
    print(f"Wrote {', '.join(files)} and snapshot.js to {OUT.relative_to(ROOT)}; network {network['stats']}")


if __name__ == "__main__":
    main()
