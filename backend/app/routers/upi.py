"""UPI Scam Guard: check a UPI ID or payment link before paying. Static inspection only."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Profile, ScamCase
from ..schemas import UpiCheckIn, UpiCheckOut
from ..scamdna.assessment import SCORE_LABEL, assess_case
from ..scamdna.evidence import redact_evidence
from ..scamdna.tactics import TacticHit
from ..scamdna.upi import LIMITATIONS, UpiParseError, detect_upi, handle_hash, parse_upi, request_text
from ..security import optional_profile, rate_limit
from ..services import cases as svc

router = APIRouter(prefix="/upi", tags=["upi guard"])

VERDICTS = {
    "high": "Strong warning signs. Do not pay.",
    "medium": "Warning signs found. Check with the person or organisation through a number you already know before paying.",
    "low": "No warning signs found in what you provided. This does not confirm the payee is genuine.",
}


def _case_matches(db: Session, profile: Profile | None, h: str) -> list[dict]:
    if profile is None:
        return []
    out = []
    for c in db.scalars(select(ScamCase).where(ScamCase.profile_id == profile.id)):
        if h in (c.assessment or {}).get("indicators", {}).get("upi_handles", []):
            out.append({"case_id": c.id, "title": c.title, "risk_level": c.risk_level, "is_demo": c.is_demo})
    return sorted(out, key=lambda m: {"high": 0, "medium": 1, "low": 2}.get(m["risk_level"], 3))[:10]


@router.post("/check", response_model=UpiCheckOut, dependencies=[Depends(rate_limit("analyze"))],
             summary="Check a UPI ID or upi:// payment link (for example from a QR code) before paying")
def check(body: UpiCheckIn, profile: Profile | None = Depends(optional_profile), db: Session = Depends(get_db)):
    try:
        p = parse_upi(body.input)
    except UpiParseError as e:
        raise HTTPException(422, str(e))
    case = None
    if body.case_id:
        if profile is None:
            raise HTTPException(401, "Create a profile to attach a check to a case")
        case = svc.get_case(db, profile, body.case_id)

    context = body.context or ""
    det, signals = detect_upi(p, context)
    matches = _case_matches(db, profile, handle_hash(p))
    risky = [m for m in matches if m["risk_level"] != "low"]
    if risky:
        names = ", ".join(("DEMO: " if m["is_demo"] else "") + m["title"] for m in risky[:3])
        signals.append({"code": "seen_in_cases", "title": "This UPI ID appears in your investigations",
                        "detail": f"The same UPI ID is in {len(risky)} of your cases rated medium or high risk ({names}).",
                        "basis": "your_cases"})
        hit = det.tactics.setdefault("repeated_indicator", TacticHit("repeated_indicator", basis="upi_request"))
        hit.add(f"UPI ID {p.masked} seen in: {names}", None, None, "upi_seen_in_cases")

    inp = svc.EventInput("message", request_text(p, context), "upi_app")
    pseudo = {"id": "u1", "seq": 1, "kind": "message", "channel": "upi_app", "observed_at": None,
              "excerpt": redact_evidence(inp.text), "detection": svc.build_detection(inp, det)}
    if p.kind == "handle" and not context.strip():
        pseudo["detection"]["data_quality"] = {
            "level": "limited", "ocr_confidence": None,
            "notes": ["Only a UPI ID was checked. Paste the message or QR that came with it for a fuller check."]}
    a = assess_case([pseudo], svc.thresholds())

    case_update = None
    if case is not None:
        r = svc.add_event(db, case, inp, det=det)
        case_update = {"case_id": case.id, "event_added": r["event"] is not None, "duplicate": bool(r["duplicate_of"]),
                       "alert": r["alert"], "change": r["change"], "risk_score": case.risk_score,
                       "risk_level": case.risk_level}
    return UpiCheckOut(
        parsed={"kind": p.kind, "handle_masked": p.masked, "psp": p.psp, "psp_known": p.psp_known,
                "payee_name": p.payee_name, "amount": p.amount, "currency": p.currency if p.amount else None,
                "note": redact_evidence(p.note) if p.note else None, "link_type": p.link_type,
                "unknown_params": p.unknown_params},
        signals=signals, case_matches=matches, tactics=a["tactics"], risk_score=a["risk_score"],
        risk_level=a["risk_level"], score_label=SCORE_LABEL, verdict=VERDICTS[a["risk_level"]],
        uncertainty=a["uncertainty"], review_required=a["review_required"], recommendations=a["recommendations"],
        primary_action=a["primary_action"], limitations=LIMITATIONS,
        stored=case is not None, case_update=case_update,
        retention="Added to your case as redacted text (the UPI ID is masked and kept only as a keyed hash)."
                  if case is not None else "Not stored: checked in memory and discarded.")
