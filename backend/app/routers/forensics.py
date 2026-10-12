"""Scam Forensics: one investigation workspace for messages, conversations, links and screenshots.

Nothing is fetched from the internet: links are inspected as text and screenshots are read
with a local OCR engine. Without a case_id nothing is stored. With a case_id, the redacted
findings are added to that Scam DNA case and the case is re-evaluated.
"""
from __future__ import annotations

import hashlib
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Profile
from ..schemas import CHANNELS, ForensicsReport, ForensicsTextIn, ForensicsUrlIn
from ..scamdna.assessment import SCORE_LABEL, assess_case
from ..scamdna.evidence import redact_evidence
from ..scamdna.ocr import UploadRejected, run_ocr, tesseract_path, validate_image
from ..security import optional_profile, rate_limit
from ..services import cases as svc

router = APIRouter(prefix="/forensics", tags=["forensics"])

SCREENSHOT_PATH = "/api/v1/forensics/screenshot"
_TURN = re.compile(r"^\s*(?:\[?\d{1,2}[:.]\d{2}(?:\s?[ap]m)?\]?\s*[-–]?\s*)?[^:\n]{1,32}:\s+\S", re.I)


def split_conversation(text: str) -> list[str]:
    """Split 'Name: message' style chats into turns. Returns [text] if it isn't a conversation."""
    lines = [ln for ln in text.splitlines() if ln.strip()]
    starts = [i for i, ln in enumerate(lines) if _TURN.match(ln) and not re.match(r"^\s*https?:", ln, re.I)]
    if len(starts) < 2:
        return [text]
    bounds = starts + [len(lines)]
    turns = ["\n".join(lines[:starts[0]])] if starts[0] > 0 else []
    turns += ["\n".join(lines[a:b]) for a, b in zip(bounds, bounds[1:])]
    return [t for t in turns if t.strip()][:20]


def _owned_case(db: Session, profile: Profile | None, case_id: str | None):
    if not case_id:
        return None
    if profile is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Create a profile to attach evidence to a case")
    return svc.get_case(db, profile, case_id)


def _report(kind: str, inputs: list[svc.EventInput], original: dict, extracted: str | None, ocr: dict | None,
            status_: str, detail: str, case, db: Session) -> ForensicsReport:
    pseudo = []
    for i, inp in enumerate(inputs, 1):
        det = svc.detect(inp)
        pseudo.append((inp, det, {"id": f"r{i}", "seq": i, "kind": inp.kind, "channel": inp.channel,
                                  "observed_at": None, "excerpt": redact_evidence(inp.text),
                                  "detection": svc.build_detection(inp, det)}))
    a = assess_case([p[2] for p in pseudo], svc.thresholds())
    url_ind = []
    for _, _, ev in pseudo:
        for u in ev["detection"]["urls"]:
            url_ind.append(u)
    case_update = None
    if case is not None:
        results = [svc.add_event(db, case, inp, det=det) for inp, det, _ in pseudo]
        last = results[-1]
        case_update = {"case_id": case.id, "events_added": sum(1 for r in results if r["event"] is not None),
                       "duplicates": sum(1 for r in results if r["duplicate_of"]),
                       "alert": last["alert"], "change": last["change"],
                       "risk_score": case.risk_score, "risk_level": case.risk_level}
    return ForensicsReport(
        report_id=uuid.uuid4().hex, input_kind=kind, analysis_status=status_, status_detail=detail,
        original=original, extracted_text=extracted, ocr=ocr,
        tactics=a["tactics"], url_indicators=url_ind, risk_score=a["risk_score"], risk_level=a["risk_level"],
        score_label=SCORE_LABEL, uncertainty=a["uncertainty"], review_required=a["review_required"],
        data_quality=a["data_quality"], model_signal=a["model_signal"], recommendations=a["recommendations"],
        primary_action=a["primary_action"], missing_evidence=a["missing_evidence"], conflicts=a["conflicts"],
        case_id=case.id if case is not None else None, case_update=case_update, stored=case is not None,
    )


@router.post("/text", response_model=ForensicsReport, dependencies=[Depends(rate_limit("analyze"))],
             summary="Investigate a message or a whole conversation")
def forensic_text(body: ForensicsTextIn, profile: Profile | None = Depends(optional_profile), db: Session = Depends(get_db)):
    case = _owned_case(db, profile, body.case_id)
    turns = split_conversation(body.text)
    kind = "conversation" if len(turns) > 1 else "message"
    original = {"kind": kind, "characters": len(body.text), "sha256": hashlib.sha256(body.text.encode()).hexdigest(),
                "turns": len(turns), "redacted_text": redact_evidence(body.text),
                "retention": "Stored only as redacted text inside the case you attached it to." if case else
                             "Not stored: analysed in memory and discarded."}
    inputs = [svc.EventInput("message", t, body.channel) for t in turns]
    detail = (f"Analysed {len(turns)} conversation turns as separate events." if len(turns) > 1
              else "Text analysed with the rule engine, link inspection and the local language model.")
    return _report(kind, inputs, original, None, None, "completed", detail, case, db)


@router.post("/url", response_model=ForensicsReport, dependencies=[Depends(rate_limit("analyze"))],
             summary="Investigate a link without opening it")
def forensic_url(body: ForensicsUrlIn, profile: Profile | None = Depends(optional_profile), db: Session = Depends(get_db)):
    case = _owned_case(db, profile, body.case_id)
    original = {"kind": "url", "characters": len(body.url), "sha256": hashlib.sha256(body.url.encode()).hexdigest(),
                "redacted_text": redact_evidence(body.url),
                "retention": "Stored without its query string inside the attached case." if case else "Not stored."}
    inp = svc.EventInput("url", body.url, "browser")
    det = svc.detect(inp)
    valid = bool(det.urls and det.urls[0]["hostname"])
    status_ = "completed" if valid else "partial"
    detail = ("The address was inspected as text only; the page was never visited." if valid else
              "This does not look like a valid web address, so only limited checks were possible.")
    return _report("url", [inp], original, None, None, status_, detail, case, db)


@router.post("/screenshot", response_model=ForensicsReport, dependencies=[Depends(rate_limit("screenshot", 12))],
             summary="Investigate a screenshot (PNG, JPEG or WebP; raw image bytes as the request body)",
             openapi_extra={"requestBody": {"required": True, "content": {
                 m: {"schema": {"type": "string", "format": "binary"}} for m in ("image/png", "image/jpeg", "image/webp")}}})
async def forensic_screenshot(request: Request, case_id: str | None = Query(None, max_length=36),
                              channel: str = Query("unknown"),
                              profile: Profile | None = Depends(optional_profile), db: Session = Depends(get_db)):
    s = get_settings()
    if channel not in CHANNELS:
        raise HTTPException(422, "Unknown channel")
    case = _owned_case(db, profile, case_id)
    # Read with a hard cap even when the client sends no Content-Length (chunked uploads).
    buf = bytearray()
    async for chunk in request.stream():
        buf.extend(chunk)
        if len(buf) > s.max_upload_bytes:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                                f"Screenshots must be smaller than {s.max_upload_bytes // 1_000_000} MB")
    try:
        info, png = validate_image(bytes(buf), request.headers.get("content-type", ""))
    except UploadRejected as e:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, str(e))
    ocr = run_ocr(png, tesseract_path(s.tesseract_cmd), timeout=s.ocr_timeout_seconds)
    media = {"mime": info.mime, "size_bytes": info.size_bytes, "width": info.width, "height": info.height,
             "sha256": info.sha256, "ocr_status": ocr.status, "ocr_confidence": ocr.mean_confidence}
    original = {"kind": "screenshot", **media,
                "retention": "The image is never stored. " + ("The redacted extracted text and these facts are kept in the case."
                                                              if case else "Nothing is kept.")}
    ocr_out = {"status": ocr.status, "engine": ocr.engine, "mean_confidence": ocr.mean_confidence,
               "word_count": ocr.word_count, "detail": ocr.detail, "notes": ocr.notes}
    if ocr.status in ("unavailable", "failed") or not ocr.text.strip():
        status_ = "unavailable" if ocr.status in ("unavailable", "failed") else "partial"
        empty = assess_case([], svc.thresholds())
        return ForensicsReport(
            report_id=uuid.uuid4().hex, input_kind="screenshot", analysis_status=status_,
            status_detail=ocr.detail + " The screenshot was not analysed for scam tactics.",
            original=original, extracted_text=None, ocr=ocr_out, tactics=[], url_indicators=[], risk_score=0,
            risk_level="low", score_label=SCORE_LABEL,
            uncertainty={"level": "high", "reasons": ["No text could be read, so no assessment was possible."]},
            review_required=True, data_quality={"level": "poor", "notes": [ocr.detail]}, model_signal=None,
            recommendations=["Paste the message text instead, or try a sharper, uncropped screenshot."],
            primary_action="No assessment: the screenshot could not be read.", missing_evidence=empty["missing_evidence"],
            conflicts=[], case_id=case.id if case else None, case_update=None, stored=False)
    inp = svc.EventInput("screenshot", ocr.text, channel, media=media, ocr_confidence=ocr.mean_confidence)
    status_ = "completed" if ocr.status == "completed" else "partial"
    detail = (f"Read {ocr.word_count} words locally with Tesseract (mean confidence {ocr.mean_confidence}/100), "
              "then analysed the text.")
    return _report("screenshot", [inp], original, redact_evidence(ocr.text), ocr_out, status_, detail, case, db)
