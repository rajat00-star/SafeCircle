import hashlib
from dataclasses import asdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..detector.engine import AnalysisResult, analyze_message, analyze_single_url
from ..models import Analysis, Profile
from ..schemas import AnalysisOut, MessageIn, UrlIn
from ..security import optional_profile, rate_limit, sign_ticket
from ..services.llm import explain

router = APIRouter(prefix="/analyze", tags=["analysis"])


def _finish(result: AnalysisResult, content: str, profile: Profile | None, db: Session,
            ai_summary: str | None = None, ai_status: str = "disabled") -> AnalysisOut:
    stored_id = None
    if profile is not None and profile.store_history:
        rec = Analysis(
            profile_id=profile.id, kind=result.kind, risk_score=result.risk_score, risk_level=result.risk_level,
            categories=result.category_codes, content_sha256=hashlib.sha256(content.encode()).hexdigest(),
            redacted_excerpt=result.redacted_excerpt if profile.store_excerpts else None,
            engine_version=result.engine_version,
        )
        db.add(rec)
        db.commit()
        stored_id = rec.id
    ticket = sign_ticket({
        "s": result.risk_score, "l": result.risk_level, "c": result.category_codes[:8],
        "x": result.redacted_excerpt, "p": profile.id if profile else None,
    })
    data = asdict(result)
    return AnalysisOut(**data, ai_summary=ai_summary, ai_status=ai_status, stored=stored_id is not None,
                       analysis_id=stored_id, alert_ticket=ticket)


@router.post("/message", response_model=AnalysisOut, dependencies=[Depends(rate_limit("analyze"))],
             summary="Check a message, email or chat for scam and phishing signals")
def analyze_message_endpoint(body: MessageIn, profile: Profile | None = Depends(optional_profile),
                             db: Session = Depends(get_db)):
    result = analyze_message(body.text)
    summary, status = explain(result) if body.explain_with_ai else (None, "disabled")
    return _finish(result, body.text, profile, db, summary, status)


@router.post("/url", response_model=AnalysisOut, dependencies=[Depends(rate_limit("analyze"))],
             summary="Check a single link without opening it")
def analyze_url_endpoint(body: UrlIn, profile: Profile | None = Depends(optional_profile),
                         db: Session = Depends(get_db)):
    return _finish(analyze_single_url(body.url), body.url, profile, db)
