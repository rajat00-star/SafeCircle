"""Demo mode: clearly labelled synthetic scenarios, analysed live by the real engine."""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Profile, ScamCase
from ..schemas import CaseDetailOut
from ..scamdna.demo import CAMPAIGN_CASES, DEMO_LABEL, SCENARIOS, check_expectation, scenario
from ..security import rate_limit, require_profile
from ..services import cases as svc
from .cases import detail_out

router = APIRouter(prefix="/demo", tags=["demo"])


@router.get("/scenarios", summary="Synthetic DEMO DATA scenarios with their expected outcomes")
def scenarios():
    return {"label": DEMO_LABEL, "scenarios": SCENARIOS}


@router.post("/scenarios/{key}/cases", response_model=CaseDetailOut, status_code=201,
             dependencies=[Depends(rate_limit("case_create", 30))],
             summary="Start an empty DEMO case for a scenario; add its fixture events one at a time")
def start_scenario(key: str, profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    sc = scenario(key)
    if sc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown scenario")
    case = svc.create_case(db, profile, f"DEMO · {sc['title']}", is_demo=True, scenario=key)
    db.commit()
    return detail_out(case)


@router.get("/scenarios/{key}/check/{case_id}", summary="Compare a DEMO case's live result with the fixture's expected outcome")
def check(key: str, case_id: str, profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    sc = scenario(key)
    case = svc.get_case(db, profile, case_id)
    if sc is None or not case.is_demo or case.assessment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nothing to compare")
    return {"scenario": key, "expected": sc["expected"], **check_expectation(sc["expected"], case.assessment),
            "complete": len(case.events) >= len(sc["events"])}


@router.post("/campaigns", status_code=201, dependencies=[Depends(rate_limit("case_create", 10))],
             summary="Load synthetic DEMO cases that form campaigns (replaces earlier demo campaign cases)")
def load_campaigns(profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    for old in db.scalars(select(ScamCase).where(ScamCase.profile_id == profile.id, ScamCase.is_demo.is_(True),
                                                 ScamCase.demo_scenario.like("campaign:%"))):
        db.delete(old)
    db.flush()
    created = []
    for spec in CAMPAIGN_CASES:
        case = svc.create_case(db, profile, f"DEMO · {spec['title']}", is_demo=True, scenario="campaign:" + spec["key"])
        for kind, channel, content in spec["events"]:
            svc.add_event(db, case, svc.EventInput(kind, content, channel), source="demo_fixture")
        created.append(case.id)
    return {"label": DEMO_LABEL, "cases_created": len(created)}


@router.delete("/cases", status_code=204, summary="Remove all DEMO cases from this profile")
def clear_demo(profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    for c in db.scalars(select(ScamCase).where(ScamCase.profile_id == profile.id, ScamCase.is_demo.is_(True))):
        db.delete(c)
    db.commit()
    return Response(status_code=204)
