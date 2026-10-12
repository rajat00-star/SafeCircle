from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Analysis, ConsentEvent, Profile, TrustedContact
from ..schemas import AnalysisRecord, ProfileCreate, ProfileCreated, ProfileOut, SettingsIn
from ..security import hash_token, new_token, rate_limit, require_profile

router = APIRouter(tags=["profile & privacy"])


@router.post("/profiles", response_model=ProfileCreated, status_code=201,
             dependencies=[Depends(rate_limit("profile_create", 10))],
             summary="Create an anonymous profile. No email or phone number is required.")
def create_profile(body: ProfileCreate, db: Session = Depends(get_db)):
    token = new_token()
    p = Profile(display_name=body.display_name, token_hash=hash_token(token))
    db.add(p)
    db.commit()
    return ProfileCreated(**ProfileOut.model_validate(p).model_dump(), token=token)


@router.get("/profiles/me", response_model=ProfileOut)
def me(profile: Profile = Depends(require_profile)):
    return profile


@router.patch("/profiles/me", response_model=ProfileOut, summary="Update privacy settings")
def update_settings(body: SettingsIn, profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(profile, field, value)
    if not profile.store_history:
        profile.store_excerpts = False
    db.commit()
    return profile


@router.get("/profiles/me/export", summary="Download everything stored about this profile")
def export(profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    contacts = db.scalars(select(TrustedContact).where(TrustedContact.profile_id == profile.id)).all()
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "profile": ProfileOut.model_validate(profile).model_dump(mode="json"),
        "analyses": [AnalysisRecord.model_validate(a).model_dump(mode="json") for a in profile.analyses],
        "trusted_contacts": [{
            "name": c.name, "status": c.status, "created_at": c.created_at.isoformat(),
            "alerts_sent": len(c.alerts),
            "consent_events": [{"event": e.event, "actor": e.actor, "at": e.at.isoformat()} for e in c.events],
        } for c in contacts],
        "investigations": [{
            "title": c.title, "status": c.status, "is_demo": c.is_demo, "created_at": c.created_at.isoformat(),
            "risk_level": c.risk_level, "risk_score": c.risk_score,
            "evidence": [{"seq": e.seq, "kind": e.kind, "channel": e.channel, "redacted_excerpt": e.excerpt,
                          "media": e.media} for e in c.events],
            "log": [{"action": x.action, "alert_action": x.alert_action, "at": x.at.isoformat()} for x in c.log],
        } for c in profile.cases],
    }


@router.delete("/profiles/me", status_code=204, summary="Delete the profile and all data, including contacts and alerts")
def delete_profile(profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    db.delete(profile)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/analyses", response_model=list[AnalysisRecord], summary="History (only if history is enabled)")
def list_analyses(profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    purge_expired(db, profile)
    return db.scalars(select(Analysis).where(Analysis.profile_id == profile.id)
                      .order_by(Analysis.created_at.desc()).limit(200)).all()


@router.delete("/analyses/{analysis_id}", status_code=204)
def delete_analysis(analysis_id: str, profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    db.execute(delete(Analysis).where(Analysis.id == analysis_id, Analysis.profile_id == profile.id))
    db.commit()
    return Response(status_code=204)


@router.delete("/analyses", status_code=204, summary="Clear all history")
def clear_analyses(profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    db.execute(delete(Analysis).where(Analysis.profile_id == profile.id))
    db.commit()
    return Response(status_code=204)


def purge_expired(db: Session, profile: Profile) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=profile.retention_days)
    db.execute(delete(Analysis).where(Analysis.profile_id == profile.id, Analysis.created_at < cutoff))
    db.commit()


def log_event(db: Session, contact: TrustedContact, event: str, actor: str) -> None:
    db.add(ConsentEvent(contact_id=contact.id, event=event, actor=actor))
