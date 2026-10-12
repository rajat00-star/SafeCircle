"""Case operations shared by the Scam DNA, Forensics and demo endpoints."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import CampaignDismissal, CaseEvent, CaseLogEntry, Profile, ScamCase, utcnow
from ..scamdna.alerts import decide_alert
from ..scamdna.assessment import Thresholds, assess_case, event_data_quality, explain_change, serialize_detection
from ..scamdna.campaigns import CaseSummary, correlate
from ..scamdna.evidence import content_hash, extract_indicators, redact_evidence, template_text
from ..scamdna.tactics import EventDetection, detect_text, detect_url


def thresholds() -> Thresholds:
    s = get_settings()
    return Thresholds(medium=s.case_medium_threshold, high=s.case_high_threshold)


def get_case(db: Session, profile: Profile, case_id: str) -> ScamCase:
    case = db.get(ScamCase, case_id)
    # Same response for "missing" and "someone else's", so case ids can't be probed.
    if case is None or case.profile_id != profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    return case


def create_case(db: Session, profile: Profile, title: str, is_demo: bool = False, scenario: str | None = None) -> ScamCase:
    n = db.scalar(select(func.count()).select_from(ScamCase).where(ScamCase.profile_id == profile.id)) or 0
    if n >= get_settings().max_cases:
        raise HTTPException(status.HTTP_409_CONFLICT, "Case limit reached; delete old cases first")
    case = ScamCase(profile_id=profile.id, title=title, is_demo=is_demo, demo_scenario=scenario)
    db.add(case)
    db.flush()
    log(db, case, "case_created", {"title": title, "demo": is_demo})
    return case


def log(db: Session, case: ScamCase, action: str, detail: dict | None = None, **kw) -> CaseLogEntry:
    entry = CaseLogEntry(case_id=case.id, action=action, detail=detail, **kw)
    db.add(entry)
    return entry


def event_dict(e: CaseEvent) -> dict:
    return {"id": e.id, "seq": e.seq, "kind": e.kind, "channel": e.channel,
            "observed_at": _iso(e.observed_at), "excerpt": e.excerpt, "detection": e.detection}


def _iso(d: datetime | None) -> str | None:
    if d is None:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).isoformat()


@dataclass
class EventInput:
    kind: str                       # message | url | screenshot
    text: str                       # message text, link, or OCR text
    channel: str = "unknown"
    observed_at: datetime | None = None
    media: dict | None = None
    ocr_confidence: float | None = None


def detect(inp: EventInput) -> EventDetection:
    return detect_url(inp.text) if inp.kind == "url" else detect_text(inp.text)


def build_detection(inp: EventInput, det: EventDetection) -> dict:
    quality = event_data_quality(inp.kind, det.text_length, inp.ocr_confidence)
    if inp.kind == "screenshot" and not inp.text.strip():
        quality = event_data_quality("screenshot", 0, None)
    indicators = extract_indicators(inp.text, det.urls, det.claimed_orgs)
    return serialize_detection(det, redact_evidence, quality, indicators)


def add_event(db: Session, case: ScamCase, inp: EventInput, source: str = "user",
              det: EventDetection | None = None) -> dict:
    """Analyse new evidence, reassess the case, decide on an alert and log everything."""
    s = get_settings()
    h = content_hash(inp.kind + ":" + inp.text) if inp.text.strip() else (inp.media or {}).get("sha256", "")
    dup = next((e for e in case.events if e.content_sha256 == h), None) if h else None
    if dup is not None:
        entry = log(db, case, "duplicate_evidence", {"duplicate_of": dup.id, "seq": dup.seq},
                    alert_action="suppressed", notify=False, fingerprint=(case.assessment or {}).get("fingerprint"),
                    risk_level=case.risk_level, risk_score=case.risk_score)
        case.updated_at = utcnow()
        db.commit()
        return {"event": None, "duplicate_of": dup.id,
                "alert": {"action": "suppressed", "notify": False,
                          "reason": f"Duplicate suppressed: identical to evidence #{dup.seq}; the assessment is unchanged."},
                "change": {"changed": False, "explanation": [f"Identical to evidence #{dup.seq}; nothing re-evaluated."],
                           "score_before": case.risk_score, "score_after": case.risk_score, "delta": 0,
                           "level_before": case.risk_level, "level_after": case.risk_level,
                           "added_tactics": [], "removed_tactics": [], "stages_added": []},
                "log_id": entry.id}
    if len(case.events) >= s.max_case_events:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A case can hold at most {s.max_case_events} pieces of evidence")

    det = det or detect(inp)
    seq = max((e.seq for e in case.events), default=0) + 1
    ev = CaseEvent(case=case, seq=seq, kind=inp.kind, channel=inp.channel, source=source,
                   observed_at=inp.observed_at, excerpt=redact_evidence(inp.text) if inp.text.strip() else "",
                   content_sha256=h, media=inp.media, detection=build_detection(inp, det))
    db.add(ev)
    db.flush()
    return _reassess(db, case, new_event=ev)


def remove_event(db: Session, case: ScamCase, event_id: str) -> dict:
    ev = next((e for e in case.events if e.id == event_id), None)
    if ev is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evidence not found")
    case.events.remove(ev)
    db.delete(ev)
    db.flush()
    log(db, case, "evidence_removed", {"seq": ev.seq})
    return _reassess(db, case, new_event=None)


def _reassess(db: Session, case: ScamCase, new_event: CaseEvent | None) -> dict:
    prev = case.assessment
    new = assess_case([event_dict(e) for e in case.events], thresholds())
    change = explain_change(prev, new, new_event.seq if new_event else None)
    last = db.scalars(select(CaseLogEntry).where(CaseLogEntry.case_id == case.id, CaseLogEntry.notify.is_(True))
                      .order_by(CaseLogEntry.id.desc()).limit(1)).first()
    last_alert = None
    if last is not None:
        last_alert = {"fingerprint": last.fingerprint, "risk_level": last.risk_level,
                      "tactics": (last.detail or {}).get("tactics", [])}
    decision = decide_alert(last_alert, new)
    case.assessment, case.last_change = new, change
    case.risk_score, case.risk_level, case.review_required = new["risk_score"], new["risk_level"], new["review_required"]
    case.updated_at = utcnow()
    if new_event is not None:
        log(db, case, "evidence_added", {"seq": new_event.seq, "kind": new_event.kind,
                                         "tactics": [t["code"] for t in new_event.detection["tactics"]]})
    entry = log(db, case, "reassessed", {"reason": decision.reason, "explanation": change["explanation"],
                                         "tactics": [t["code"] for t in new["tactics"]],
                                         "score_before": change["score_before"]},
                alert_action=decision.action, notify=decision.notify, fingerprint=new["fingerprint"],
                risk_level=new["risk_level"], risk_score=new["risk_score"])
    db.commit()
    return {"event": new_event, "duplicate_of": None,
            "alert": {"action": decision.action, "notify": decision.notify, "reason": decision.reason},
            "change": change, "log_id": entry.id}


def purge_expired_cases(db: Session, profile: Profile) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=profile.retention_days)
    db.execute(delete(ScamCase).where(ScamCase.profile_id == profile.id, ScamCase.updated_at < cutoff))
    db.commit()


def summaries(cases: list[ScamCase]) -> list[CaseSummary]:
    out = []
    for c in cases:
        a = c.assessment or {}
        out.append(CaseSummary(
            id=c.id, title=c.title, is_demo=c.is_demo, risk_level=c.risk_level, risk_score=c.risk_score,
            tactics=[t["code"] for t in a.get("tactics", [])], indicators=a.get("indicators", {}),
            templates=[template_text(e.excerpt) for e in c.events if e.kind != "url" and e.excerpt],
            updated_at=_iso(c.updated_at)))
    return out


def campaign_view(db: Session, profile: Profile) -> dict:
    cases = db.scalars(select(ScamCase).where(ScamCase.profile_id == profile.id)).all()
    dismissed = set(db.scalars(select(CampaignDismissal.pair).where(CampaignDismissal.profile_id == profile.id)).all())
    return correlate(summaries(list(cases)), dismissed)
