"""Scam DNA investigations, Campaign Radar and the overview metrics.

All endpoints require a profile and only ever touch that profile's cases.
"""
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import CampaignDismissal, CaseEvent, CaseLogEntry, Profile, ScamCase
from ..schemas import (CaseCreate, CaseDetailOut, CaseSummaryOut, CaseUpdate, DismissIn, EventAdded, EventIn)
from ..scamdna.campaigns import pair_key
from ..security import rate_limit, require_profile
from ..services import cases as svc

router = APIRouter(tags=["scam dna"])


def summary_out(c: ScamCase) -> CaseSummaryOut:
    s = CaseSummaryOut.model_validate(c)
    s.event_count = len(c.events)
    s.stages = (c.assessment or {}).get("stages_observed", [])
    return s


def detail_out(c: ScamCase) -> CaseDetailOut:
    base = summary_out(c).model_dump()
    return CaseDetailOut(**base, events=c.events, assessment=c.assessment, last_change=c.last_change,
                         log=list(reversed(c.log[-60:])))


@router.get("/cases", response_model=list[CaseSummaryOut], summary="List your investigations")
def list_cases(profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    svc.purge_expired_cases(db, profile)
    rows = db.scalars(select(ScamCase).where(ScamCase.profile_id == profile.id)
                      .order_by(ScamCase.updated_at.desc()).limit(200)).all()
    return [summary_out(c) for c in rows]


@router.post("/cases", response_model=CaseDetailOut, status_code=201, summary="Start an investigation",
             dependencies=[Depends(rate_limit("case_create", 30))])
def create(body: CaseCreate, profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    case = svc.create_case(db, profile, body.title)
    db.commit()
    return detail_out(case)


@router.get("/cases/{case_id}", response_model=CaseDetailOut)
def get(case_id: str, profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    return detail_out(svc.get_case(db, profile, case_id))


@router.patch("/cases/{case_id}", response_model=CaseDetailOut, summary="Rename or change status (open, review, closed)")
def update(case_id: str, body: CaseUpdate, profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    case = svc.get_case(db, profile, case_id)
    if body.title is not None:
        case.title = " ".join(body.title.split())
    if body.status is not None and body.status != case.status:
        svc.log(db, case, "status_changed", {"from": case.status, "to": body.status})
        case.status = body.status
    db.commit()
    return detail_out(case)


@router.delete("/cases/{case_id}", status_code=204)
def remove(case_id: str, profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    case = svc.get_case(db, profile, case_id)
    db.execute(delete(CampaignDismissal).where(CampaignDismissal.profile_id == profile.id,
                                               CampaignDismissal.pair.contains(case.id)))
    db.delete(case)
    db.commit()
    return Response(status_code=204)


@router.post("/cases/{case_id}/events", response_model=EventAdded, summary="Add a message or link and re-evaluate",
             dependencies=[Depends(rate_limit("analyze"))])
def add_event(case_id: str, body: EventIn, profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    case = svc.get_case(db, profile, case_id)
    content = body.content.strip() if body.kind == "url" else body.content
    if body.kind == "url" and (len(content) > 2048 or any(ch.isspace() for ch in content)):
        raise HTTPException(422, "A link must be a single address without spaces")
    res = svc.add_event(db, case, svc.EventInput(body.kind, content, body.channel, body.observed_at),
                        source="demo_fixture" if case.is_demo else "user")
    return EventAdded(event=res["event"], duplicate_of=res["duplicate_of"], alert=res["alert"], change=res["change"],
                      case=detail_out(case))


@router.delete("/cases/{case_id}/events/{event_id}", response_model=CaseDetailOut,
               summary="Remove a piece of evidence (for example one that turned out to be unrelated) and re-evaluate")
def remove_event(case_id: str, event_id: str, profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    case = svc.get_case(db, profile, case_id)
    svc.remove_event(db, case, event_id)
    return detail_out(case)


# ---------- Campaign Radar ----------

@router.get("/campaigns", summary="Potentially related cases, with the indicators that link them")
def campaigns(profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    return svc.campaign_view(db, profile)


@router.post("/campaigns/dismissals", status_code=201, summary="Mark two cases as not related")
def dismiss(body: DismissIn, profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    a, b = svc.get_case(db, profile, body.case_a), svc.get_case(db, profile, body.case_b)
    if a.id == b.id:
        raise HTTPException(422, "Pick two different cases")
    key = pair_key(a.id, b.id)
    exists = db.scalar(select(CampaignDismissal).where(CampaignDismissal.profile_id == profile.id,
                                                       CampaignDismissal.pair == key))
    if exists is None:
        db.add(CampaignDismissal(profile_id=profile.id, pair=key))
        for c in (a, b):
            svc.log(db, c, "relationship_dismissed", {"other_case": (b if c is a else a).title})
        db.commit()
    return {"pair": key, "dismissed": True}


@router.delete("/campaigns/dismissals", status_code=204, summary="Restore a dismissed relationship")
def restore(body: DismissIn, profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    key = pair_key(body.case_a, body.case_b)
    db.execute(delete(CampaignDismissal).where(CampaignDismissal.profile_id == profile.id, CampaignDismissal.pair == key))
    db.commit()
    return Response(status_code=204)


# ---------- Overview ----------

@router.get("/overview", summary="Metrics computed from your own cases")
def overview(profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    svc.purge_expired_cases(db, profile)
    cases = db.scalars(select(ScamCase).where(ScamCase.profile_id == profile.id)).all()
    ids = [c.id for c in cases]
    demo_ids = {c.id for c in cases if c.is_demo}
    actions: Counter = Counter()
    demo_actions: Counter = Counter()
    if ids:
        for cid, act, notify in db.execute(select(CaseLogEntry.case_id, CaseLogEntry.alert_action, CaseLogEntry.notify)
                                           .where(CaseLogEntry.case_id.in_(ids), CaseLogEntry.alert_action.is_not(None))):
            key = "raised" if notify else act
            actions[key] += 1
            if cid in demo_ids:
                demo_actions[key] += 1
    camp = svc.campaign_view(db, profile)
    recent = []
    if ids:
        titles = {c.id: (c.title, c.is_demo) for c in cases}
        for e in db.scalars(select(CaseLogEntry).where(CaseLogEntry.case_id.in_(ids))
                            .order_by(CaseLogEntry.id.desc()).limit(10)):
            recent.append({"case_id": e.case_id, "case_title": titles[e.case_id][0], "is_demo": titles[e.case_id][1],
                           "at": e.at, "action": e.action, "alert_action": e.alert_action,
                           "risk_level": e.risk_level, "risk_score": e.risk_score,
                           "reason": (e.detail or {}).get("reason")})
    events = db.scalar(select(func.count()).select_from(CaseEvent).where(CaseEvent.case_id.in_(ids))) if ids else 0

    def split(pred) -> dict:
        sel = [c for c in cases if pred(c)]
        return {"total": len(sel), "demo": sum(1 for c in sel if c.is_demo)}
    return {
        "source": "Computed from the cases stored in your profile. Cases marked DEMO are synthetic demo data.",
        "investigations": split(lambda c: True),
        "evidence_items": events,
        "open_cases": split(lambda c: c.status != "closed"),
        "review_required": split(lambda c: c.status != "closed" and (c.review_required or c.status == "review")),
        "high_risk": split(lambda c: c.risk_level == "high"),
        "campaigns": {"total": len(camp["campaigns"]), "demo": sum(1 for x in camp["campaigns"] if x["is_demo"])},
        "alerts_raised": {"total": actions["raised"], "demo": demo_actions["raised"]},
        "duplicates_suppressed": {"total": actions["suppressed"], "demo": demo_actions["suppressed"]},
        "recent_activity": recent,
    }
