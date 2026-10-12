"""Evaluate SafeCircle on the frozen synthetic holdout set v2 (DEMO DATA) through the real HTTP API.

Usage (from the repository root):
    backend/.venv/bin/python evaluation/holdout_v2/evaluate_holdout.py [--out results_v2_baseline.json]

Every scenario gets a fresh profile and a fresh case in a throwaway SQLite database inside a temporary
directory; backend/safecircle.db is never opened. Evidence goes through the same endpoints the web app
uses (cases/events, upi/check with case_id, forensics/text, forensics/screenshot), and the final case
state is read back with GET /cases/{id}. The dataset checksum is verified first so a silently edited
label set cannot be scored.

Two baselines run on the same scenarios and labels:
  keyword  a fixed keyword list written before the first run (below), flagged if any word appears
  legacy   the original single-message detector (POST /analyze/message|url), flagged if any event is
           medium or high. Screenshot events are given their source text, i.e. perfect OCR.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DATASET = HERE / "dataset_v2.json"
CHECKSUM = HERE / "dataset_v2.sha256"

_TMP = Path(tempfile.mkdtemp(prefix="safecircle-holdout-"))
os.environ["SAFECIRCLE_DATABASE_URL"] = f"sqlite:///{_TMP / 'holdout.db'}"
os.environ["SAFECIRCLE_SECRET_KEY"] = "holdout-evaluation-only-secret"
os.environ["SAFECIRCLE_LLM_PROVIDER"] = "none"
os.environ["SAFECIRCLE_LOG_LEVEL"] = "WARNING"
os.environ["SAFECIRCLE_RATE_LIMIT_PER_MINUTE"] = "100000"
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.security import limiter  # noqa: E402

API = "/api/v1"

# Frozen keyword baseline. Written before the first run and not changed afterwards.
KEYWORDS = ["otp", "pin", "kyc", "urgent", "immediately", "blocked", "suspended", "deactivated", "disconnected",
            "verify", "lottery", "won", "prize", "refund", "cashback", "click", "http", "bit.ly", "apk", "arrest",
            "police", "fee", "deposit", "password", "expire", "expired", "penalty", "frozen"]


def outcome(level: str, review: bool) -> str:
    return {"high": "alert", "medium": "warn"}.get(level, "review" if review else "clear")


def render_png(text: str | None) -> bytes:
    """Render text as a phone-screenshot-like PNG (white background, dark text), or a blank image."""
    img = Image.new("RGB", (900, 420), "white")
    if text:
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 30)
        except OSError:
            font = ImageFont.load_default(size=30)
        d, words, line, y = ImageDraw.Draw(img), text.split(), "", 30
        for w in words:
            if d.textlength(line + " " + w, font=font) > 840:
                d.text((30, y), line.strip(), fill="black", font=font)
                y, line = y + 42, ""
            line += " " + w
        d.text((30, y), line.strip(), fill="black", font=font)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def content_of(ev: dict) -> str:
    if "content_repeat" in ev:
        return ev["content_repeat"]["text"] * ev["content_repeat"]["times"]
    return ev.get("content", "")


def submit(c: TestClient, h: dict, case_id: str, ev: dict):
    kind = ev["kind"]
    if kind in ("message", "url"):
        return c.post(f"{API}/cases/{case_id}/events", headers=h,
                      json={"kind": kind, "content": content_of(ev), "channel": ev.get("channel", "unknown")})
    if kind == "upi":
        return c.post(f"{API}/upi/check", headers=h,
                      json={"input": ev["input"], "context": ev.get("context") or None, "case_id": case_id})
    if kind == "conversation":
        return c.post(f"{API}/forensics/text", headers=h,
                      json={"text": content_of(ev), "case_id": case_id, "channel": ev.get("channel", "unknown")})
    if kind in ("screenshot", "blank_screenshot"):
        png = render_png(content_of(ev) if kind == "screenshot" else None)
        return c.post(f"{API}/forensics/screenshot", params={"case_id": case_id, "channel": ev.get("channel", "unknown")},
                      headers={**h, "Content-Type": "image/png"}, content=png)
    raise ValueError(kind)


def baseline_text(ev: dict) -> str:
    if ev["kind"] == "upi":
        return f"{ev['input']} {ev.get('context', '')}"
    return content_of(ev)


def keyword_flag(sc: dict) -> bool:
    text = " ".join(baseline_text(e) for e in sc["events"] if e["kind"] != "blank_screenshot").lower()
    import re
    return any(re.search(r"(?<![a-z])" + re.escape(k) + r"(?![a-z])", text) for k in KEYWORDS)


def legacy_flag(c: TestClient, sc: dict) -> bool:
    flagged = False
    for ev in sc["events"]:
        if ev["kind"] == "blank_screenshot":
            continue
        if ev["kind"] == "url":
            r = c.post(f"{API}/analyze/url", json={"url": content_of(ev)})
        else:
            r = c.post(f"{API}/analyze/message", json={"text": baseline_text(ev)[:5000]})
        if r.status_code == 200 and r.json()["risk_level"] in ("medium", "high"):
            flagged = True
    return flagged


def run_scenario(c: TestClient, sc: dict) -> dict:
    limiter.reset()
    p = c.post(f"{API}/profiles", json={"display_name": f"Eval {sc['id']}"}).json()
    h = {"Authorization": f"Bearer {p['token']}"}
    case_id = c.post(f"{API}/cases", headers=h, json={"title": f"DEMO DATA holdout {sc['id']}"}).json()["id"]
    steps, t0 = [], time.perf_counter()
    for ev in sc["events"]:
        before = c.get(f"{API}/cases/{case_id}", headers=h).json()
        r = submit(c, h, case_id, ev)
        after = c.get(f"{API}/cases/{case_id}", headers=h).json()
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        dup = False
        if ev["kind"] in ("message", "url") and r.status_code == 200:
            dup = bool(body.get("duplicate_of"))
        elif ev["kind"] == "upi" and r.status_code == 200 and body.get("case_update"):
            dup = bool(body["case_update"].get("duplicate"))
        elif ev["kind"] in ("conversation", "screenshot") and r.status_code == 200 and body.get("case_update"):
            dup = bool(body["case_update"].get("duplicates"))
        steps.append({"kind": ev["kind"], "http_status": r.status_code, "duplicate": dup,
                      "stored": body.get("stored") if isinstance(body, dict) else None,
                      "response_review_required": body.get("review_required") if isinstance(body, dict) else None,
                      "case_changed": len(after["events"]) != len(before["events"]),
                      "ocr_status": (body.get("ocr") or {}).get("status") if isinstance(body, dict) else None})
    elapsed_ms = (time.perf_counter() - t0) * 1000
    case = c.get(f"{API}/cases/{case_id}", headers=h).json()
    a = case.get("assessment") or {}
    notes = [e for e in case["log"] if e["notify"]]
    return {"case": case, "steps": steps, "elapsed_ms": round(elapsed_ms, 1),
            "level": case["risk_level"], "score": case["risk_score"], "review": case["review_required"],
            "outcome": outcome(case["risk_level"], case["review_required"]),
            "tactics": sorted(t["code"] for t in a.get("tactics", [])),
            "conflicts": len(a.get("conflicts", [])), "notifications": len(notes)}


def rates(tp: int, fp: int, tn: int, fn: int) -> dict:
    def div(a, b):
        return {"value": round(a / b, 3) if b else None, "numerator": a, "denominator": b}
    return {"tp": tp, "fp": fp, "tn": tn, "fn": fn,
            "precision": div(tp, tp + fp), "recall": div(tp, tp + fn),
            "false_positive_rate": div(fp, fp + tn), "false_negative_rate": div(fn, fn + tp),
            "f1": round(2 * tp / (2 * tp + fp + fn), 3) if tp else 0.0}


def confusion(rows: list[dict], key: str) -> dict:
    tp = sum(1 for r in rows if r["label"] == "scam" and r[key])
    fn = sum(1 for r in rows if r["label"] == "scam" and not r[key])
    fp = sum(1 for r in rows if r["label"] == "benign" and r[key])
    tn = sum(1 for r in rows if r["label"] == "benign" and not r[key])
    return rates(tp, fp, tn, fn)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="results_v2_baseline.json")
    args = ap.parse_args()

    raw = DATASET.read_bytes()
    want = CHECKSUM.read_text().split()[0]
    got = hashlib.sha256(raw).hexdigest()
    if got != want:
        sys.exit(f"Dataset checksum mismatch: {got} != {want}. The frozen set was edited; refusing to score it.")
    data = json.loads(raw)

    Base.metadata.create_all(engine)
    c = TestClient(app)
    rows, integration = [], []
    for sc in data["scenarios"]:
        r = run_scenario(c, sc)
        row = {"id": sc["id"], "category": sc["category"], "label": sc["label"], "description": sc["description"],
               "acceptable": sc.get("acceptable"), "outcome": r["outcome"], "level": r["level"], "score": r["score"],
               "review_required": r["review"], "tactics": r["tactics"], "conflicts": r["conflicts"],
               "notifications": r["notifications"], "elapsed_ms": r["elapsed_ms"], "steps": r["steps"],
               "flagged": r["outcome"] != "clear", "flagged_strict": r["outcome"] in ("warn", "alert"),
               "keyword_flagged": keyword_flag(sc), "legacy_flagged": legacy_flag(c, sc)}
        if sc.get("acceptable"):
            row["acceptable_ok"] = r["outcome"] in sc["acceptable"]
        exp = sc.get("expect")
        if exp:
            checks = {}
            last = r["steps"][-1]
            if "http_status" in exp:
                checks["http_status"] = all(s["http_status"] in exp["http_status"] for s in r["steps"])
            if exp.get("no_server_error"):
                checks["no_server_error"] = all(s["http_status"] < 500 for s in r["steps"])
            if exp.get("case_unchanged"):
                checks["case_unchanged"] = not any(s["case_changed"] for s in r["steps"])
            if "stored" in exp:
                checks["stored"] = last["stored"] == exp["stored"]
            if "review_required" in exp:
                checks["review_required"] = last["response_review_required"] == exp["review_required"]
            if "duplicates" in exp:
                checks["duplicates"] = sum(s["duplicate"] for s in r["steps"]) == exp["duplicates"]
            if "max_notifications" in exp:
                checks["max_notifications"] = r["notifications"] <= exp["max_notifications"]
            row["expect_checks"] = checks
            row["expect_ok"] = all(checks.values())
            integration.append(row)
        rows.append(row)

    labelled = [r for r in rows if r["label"] in ("scam", "benign")]
    amb = [r for r in rows if r["label"] == "ambiguous"]
    with_acc = [r for r in rows if "acceptable_ok" in r]
    lat = sorted(r["elapsed_ms"] / max(1, len(r["steps"])) for r in labelled)
    outcome_matrix = {lab: {o: sum(1 for r in rows if r["label"] == lab and r["outcome"] == o)
                            for o in ("clear", "review", "warn", "alert")}
                      for lab in ("scam", "benign", "ambiguous", "integration")}
    metrics = {
        "dataset": DATASET.name, "dataset_version": data["version"], "dataset_sha256": got,
        "scenarios": len(rows), "binary_scored": len(labelled),
        "scam": sum(r["label"] == "scam" for r in rows), "benign": sum(r["label"] == "benign" for r in rows),
        "ambiguous": len(amb), "integration_only": sum(r["label"] == "integration" for r in rows),
        "positive_definition": "flagged = outcome is review, warn or alert (any outcome other than clear); "
                               "strict = warn or alert only. Ambiguous and integration scenarios are excluded from "
                               "precision/recall and scored against their acceptable outcomes instead.",
        "safecircle": confusion(labelled, "flagged"),
        "safecircle_strict": confusion(labelled, "flagged_strict"),
        "baseline_keyword": confusion(labelled, "keyword_flagged"),
        "baseline_legacy_detector": confusion(labelled, "legacy_flagged"),
        "outcome_matrix_label_by_outcome": outcome_matrix,
        "acceptable_outcome_rate": {"ok": sum(r["acceptable_ok"] for r in with_acc), "of": len(with_acc)},
        "ambiguous_acceptable": {"ok": sum(r["acceptable_ok"] for r in amb), "of": len(amb)},
        "integration_expectations": {"ok": sum(r["expect_ok"] for r in integration), "of": len(integration)},
        "alerts": {"total_notifications": sum(r["notifications"] for r in rows),
                   "benign_scenarios_with_a_notification": sum(1 for r in rows if r["label"] == "benign" and r["notifications"]),
                   "scenarios_with_more_than_one_notification": sum(1 for r in rows if r["notifications"] > 1)},
        "latency_ms_per_event_api_inprocess": {"p50": lat[len(lat) // 2], "max": lat[-1],
                                                "note": "TestClient in-process, includes local OCR for screenshots; not network latency"},
    }
    out = HERE / args.out
    out.write_text(json.dumps({"label": data["label"], "metrics": metrics, "rows": rows}, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(metrics, indent=2))
    for r in rows:
        ok = r.get("acceptable_ok", r.get("expect_ok"))
        print(f"{'ok ' if ok else 'ERR'} {r['id']} {r['label']:11} out={r['outcome']:6} score={r['score']:3} "
              f"acc={r.get('acceptable')} kw={int(r['keyword_flagged'])} leg={int(r['legacy_flagged'])} "
              f"notif={r['notifications']} {r.get('expect_checks', '')} {r['description']}")


if __name__ == "__main__":
    main()
