"""Trusted contacts with explicit, revocable, two-sided consent.

Flow:
1. The user adds a contact and receives a one-time invite link. The server
   never sends messages on the user's behalf; the user shares the link.
2. The contact opens the link, sees exactly what they would receive, and
   accepts or declines. Nothing is shared before acceptance.
3. Only after acceptance can the user send an alert, and only by explicitly
   choosing to. Alerts carry a summary; a redacted excerpt only if the user
   ticks the box for that alert.
4. Either side can end the link at any time. Every decision is logged.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Alert, Profile, TrustedContact
from ..schemas import (AlertCreate, AlertOut, AlertSent, ContactCreate, ContactCreated, ContactOut, GuardianInbox,
                       InviteInfo)
from ..security import hash_token, limiter, new_token, rate_limit, require_profile, verify_ticket
from .profiles import log_event

router = APIRouter(tags=["trusted contacts"])

RECEIVES = [
    "An alert when {name} chooses to send you one about a suspicious message",
    "The risk level and the warning signs found (for example: 'asks for a one-time code')",
    "An optional short note from {name}",
    "A redacted excerpt only if {name} ticks that option for a specific alert (codes, card numbers, phone numbers and emails removed)",
]
NOT_RECEIVES = [
    "Access to {name}'s messages, phone, accounts or location",
    "Automatic monitoring: alerts are only sent when {name} decides to",
    "The full original message",
]


def _aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:  # SQLite drops tzinfo
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _refresh_expiry(db: Session, c: TrustedContact) -> None:
    if c.status == "pending" and _aware(c.invite_expires_at) < datetime.now(timezone.utc):
        c.status = "expired"
        log_event(db, c, "invite_expired", "system")
        db.commit()


@router.post("/contacts", response_model=ContactCreated, status_code=201)
def add_contact(body: ContactCreate, request: Request, profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    s = get_settings()
    open_count = db.scalar(select(func.count()).select_from(TrustedContact).where(
        TrustedContact.profile_id == profile.id, TrustedContact.status.in_(["pending", "active"])))
    if open_count >= s.max_contacts:
        raise HTTPException(status.HTTP_409_CONFLICT, f"You can have at most {s.max_contacts} trusted contacts")
    token = new_token()
    c = TrustedContact(profile_id=profile.id, name=" ".join(body.name.split()),
                       relationship_label=body.relationship_label, access_token_hash=hash_token(token),
                       invite_expires_at=datetime.now(timezone.utc) + timedelta(hours=s.invite_ttl_hours))
    db.add(c)
    db.flush()
    log_event(db, c, "invite_created", "user")
    db.commit()
    # The token goes in the URL fragment (#...), which browsers never send to servers or in Referer headers.
    base = (s.public_base_url or str(request.base_url)).rstrip("/")
    invite_url = f"{base}/guardian/#t={token}"
    return ContactCreated(**ContactOut.model_validate(c).model_dump(), invite_url=invite_url)


@router.get("/contacts", response_model=list[ContactOut])
def list_contacts(profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    contacts = db.scalars(select(TrustedContact).where(TrustedContact.profile_id == profile.id)
                          .order_by(TrustedContact.created_at.desc())).all()
    for c in contacts:
        _refresh_expiry(db, c)
    return contacts


@router.delete("/contacts/{contact_id}", status_code=204, summary="Revoke a contact (ends the link immediately)")
def revoke_contact(contact_id: str, profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    c = db.get(TrustedContact, contact_id)
    if c is None or c.profile_id != profile.id:
        raise HTTPException(404, "Contact not found")
    if c.status in ("pending", "active"):
        c.status = "revoked"
        c.ended_at = datetime.now(timezone.utc)
        log_event(db, c, "revoked", "user")
        db.commit()
    return Response(status_code=204)


@router.post("/alerts", response_model=AlertSent, summary="Send an alert to consenting trusted contacts")
def send_alert(body: AlertCreate, profile: Profile = Depends(require_profile), db: Session = Depends(get_db)):
    s = get_settings()
    ticket = verify_ticket(body.alert_ticket)
    if ticket.get("p") not in (None, profile.id):
        raise HTTPException(403, "This analysis belongs to a different profile")
    ok, retry = limiter.check(f"alerts:{profile.id}", s.alert_limit_per_hour, 3600)
    if not ok:
        raise HTTPException(429, "Alert limit reached, try again later", headers={"Retry-After": str(retry)})
    sent, skipped = [], []
    for cid in dict.fromkeys(body.contact_ids):
        c = db.get(TrustedContact, cid)
        if c is None or c.profile_id != profile.id:
            skipped.append({"contact_id": cid, "reason": "not_found"})
            continue
        if c.status != "active":
            skipped.append({"contact_id": cid, "reason": f"contact_{c.status}"})
            continue
        db.add(Alert(contact_id=c.id, risk_score=int(ticket["s"]), risk_level=ticket["l"], categories=ticket["c"],
                     note=body.note.strip() if body.note else None,
                     redacted_excerpt=ticket["x"] if body.include_excerpt else None))
        log_event(db, c, "alert_sent", "user")
        sent.append(c.id)
    db.commit()
    return AlertSent(sent_to=sent, skipped=skipped)


# ---------- Contact side (authenticated by the invite token in X-Guardian-Token) ----------

def _contact_from_token(db: Session, token: str | None) -> TrustedContact:
    if not token:
        raise HTTPException(401, "Missing guardian token")
    c = db.scalar(select(TrustedContact).where(TrustedContact.access_token_hash == hash_token(token)))
    if c is None:
        raise HTTPException(404, "This link is not valid")
    _refresh_expiry(db, c)
    return c


@router.get("/guardian/invite", response_model=InviteInfo, dependencies=[Depends(rate_limit("guardian", 30))])
def invite_info(x_guardian_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    c = _contact_from_token(db, x_guardian_token)
    name = c.profile.display_name
    return InviteInfo(requester_name=name, contact_name=c.name, status=c.status,
                      invite_expires_at=c.invite_expires_at,
                      what_you_will_receive=[r.format(name=name) for r in RECEIVES],
                      what_you_will_not_receive=[r.format(name=name) for r in NOT_RECEIVES])


@router.post("/guardian/accept", response_model=InviteInfo, dependencies=[Depends(rate_limit("guardian", 30))])
def accept(x_guardian_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    c = _contact_from_token(db, x_guardian_token)
    if c.status != "pending":
        raise HTTPException(409, f"This invitation is {c.status}")
    c.status = "active"
    c.consented_at = datetime.now(timezone.utc)
    log_event(db, c, "consent_given", "contact")
    db.commit()
    return invite_info(x_guardian_token, db)


@router.post("/guardian/decline", status_code=204, dependencies=[Depends(rate_limit("guardian", 30))])
def decline(x_guardian_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    c = _contact_from_token(db, x_guardian_token)
    if c.status == "pending":
        c.status = "declined"
        c.ended_at = datetime.now(timezone.utc)
        log_event(db, c, "consent_declined", "contact")
    elif c.status == "active":
        c.status = "revoked"
        c.ended_at = datetime.now(timezone.utc)
        log_event(db, c, "consent_withdrawn", "contact")
    db.commit()
    return Response(status_code=204)


@router.get("/guardian/alerts", response_model=GuardianInbox, dependencies=[Depends(rate_limit("guardian", 30))])
def inbox(x_guardian_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    c = _contact_from_token(db, x_guardian_token)
    if c.status != "active":
        raise HTTPException(403, f"This link is {c.status}")
    alerts = sorted(c.alerts, key=lambda a: _aware(a.created_at), reverse=True)[:100]
    return GuardianInbox(requester_name=c.profile.display_name, contact_name=c.name, status=c.status,
                         alerts=[AlertOut.model_validate(a) for a in alerts])


@router.post("/guardian/alerts/{alert_id}/ack", response_model=AlertOut,
             dependencies=[Depends(rate_limit("guardian", 30))])
def acknowledge(alert_id: str, x_guardian_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    c = _contact_from_token(db, x_guardian_token)
    a = db.get(Alert, alert_id)
    if c.status != "active" or a is None or a.contact_id != c.id:
        raise HTTPException(404, "Alert not found")
    if a.acknowledged_at is None:
        a.acknowledged_at = datetime.now(timezone.utc)
        db.commit()
    return a
