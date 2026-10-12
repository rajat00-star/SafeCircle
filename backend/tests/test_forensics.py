"""Scam Forensics: text, conversations, links and screenshots (validation, OCR success and failure)."""
import io
import shutil
import struct
import zlib

import pytest
from PIL import Image, ImageDraw, ImageFont

from app.routers.forensics import split_conversation
from app.scamdna import ocr as ocr_mod

API = "/api/v1"
HAS_TESSERACT = shutil.which("tesseract") is not None
SCAM_LINES = ["Dear SBI customer, your KYC is pending.", "Your account will be blocked today.",
              "Share the OTP 482913 with our officer now."]


def png_with_text(lines=SCAM_LINES, size=(900, 300)) -> bytes:
    img = Image.new("RGB", size, "white")
    d = ImageDraw.Draw(img)
    try:
        f = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 30)
    except OSError:
        f = ImageFont.load_default(size=30)
    for i, line in enumerate(lines):
        d.text((24, 24 + i * 52), line, font=f, fill="black")
    b = io.BytesIO()
    img.save(b, format="PNG")
    return b.getvalue()


def post_image(client, data, ctype="image/png", headers=None, params=""):
    return client.post(f"{API}/forensics/screenshot{params}", content=data,
                       headers={"content-type": ctype, **(headers or {})})


def test_text_report_is_complete_and_not_stored(client):
    r = client.post(f"{API}/forensics/text", json={"text": " ".join(SCAM_LINES)})
    assert r.status_code == 200
    b = r.json()
    assert b["analysis_status"] == "completed" and b["input_kind"] == "message"
    assert b["risk_level"] in ("medium", "high") and not b["stored"]
    assert {"kyc_suspension", "secret_request"} <= {t["code"] for t in b["tactics"]}
    assert all(t["evidence"] for t in b["tactics"])
    assert "482913" not in b["original"]["redacted_text"]
    assert "Not stored" in b["original"]["retention"]


def test_conversation_is_split_into_turns():
    convo = "Agent: This is SBI KYC desk.\nMe: ok\nAgent: Share the OTP you got.\nAgent: Approve the collect request now."
    assert len(split_conversation(convo)) == 4
    assert split_conversation("Just one message: nothing else") == ["Just one message: nothing else"]


def test_conversation_report_builds_a_chain(client):
    convo = ("Agent: Dear SBI customer, your KYC is pending and your account will be blocked.\n"
             "Me: what should I do?\nAgent: Share the OTP sent to your phone.\n"
             "Agent: Now approve the collect request in your UPI app.")
    b = client.post(f"{API}/forensics/text", json={"text": convo}).json()
    assert b["input_kind"] == "conversation" and b["original"]["turns"] == 4
    assert {"secret_request", "upi_collect"} <= {t["code"] for t in b["tactics"]}


def test_text_validation(client):
    assert client.post(f"{API}/forensics/text", json={"text": "  "}).status_code == 422
    assert client.post(f"{API}/forensics/text", json={"text": "x" * 5001}).status_code == 422
    assert client.post(f"{API}/forensics/text", json={"text": "hi", "channel": "fax"}).status_code == 422


def test_url_report_and_malformed_url(client):
    b = client.post(f"{API}/forensics/url", json={"url": "http://sbi-kyc-update.example/kyc/login?u=me@x.com"}).json()
    assert b["analysis_status"] == "completed" and b["url_indicators"][0]["signals"]
    assert "never visited" in b["status_detail"]
    assert "me@x.com" not in str(b)
    bad = client.post(f"{API}/forensics/url", json={"url": "http://[::1"}).json()
    assert bad["analysis_status"] == "partial"
    assert client.post(f"{API}/forensics/url", json={"url": "has space"}).status_code == 422


@pytest.mark.skipif(not HAS_TESSERACT, reason="Tesseract is not installed")
def test_screenshot_ocr_success(client):
    r = post_image(client, png_with_text())
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["analysis_status"] in ("completed", "partial")
    assert b["ocr"]["status"] in ("completed", "partial") and b["ocr"]["word_count"] > 5
    assert "KYC" in b["extracted_text"] and "482913" not in b["extracted_text"]
    assert {"kyc_suspension", "secret_request"} <= {t["code"] for t in b["tactics"]}
    assert b["original"]["sha256"] and b["original"]["width"] == 900
    assert "never stored" in b["original"]["retention"]


def test_ocr_unavailable_is_reported_honestly(client, monkeypatch):
    monkeypatch.setattr("app.routers.forensics.tesseract_path", lambda _c="": None)
    b = post_image(client, png_with_text()).json()
    assert b["analysis_status"] == "unavailable"
    assert b["tactics"] == [] and b["extracted_text"] is None
    assert "not analysed" in b["status_detail"] and b["review_required"]


def test_ocr_failure_is_reported_honestly(client, monkeypatch):
    monkeypatch.setattr("app.routers.forensics.run_ocr",
                        lambda *a, **k: ocr_mod.OcrResult("failed", detail="The OCR engine could not read this image."))
    b = post_image(client, png_with_text()).json()
    assert b["analysis_status"] == "unavailable" and b["risk_level"] == "low" and not b["tactics"]


def test_blank_image_is_partial_not_safe(client, monkeypatch):
    monkeypatch.setattr("app.routers.forensics.run_ocr", lambda *a, **k: ocr_mod.parse_tsv("level\theader\n"))
    b = post_image(client, png_with_text(lines=[])).json()
    assert b["analysis_status"] == "partial" and "not analysed" in b["status_detail"]


def test_upload_rejections(client, monkeypatch):
    png = png_with_text()
    assert post_image(client, png, ctype="image/gif").status_code == 415            # MIME not allowed
    assert post_image(client, png, ctype="image/jpeg").status_code == 415           # magic bytes disagree
    assert post_image(client, b"<svg xmlns='http://www.w3.org/2000/svg'/>", ctype="image/png").status_code == 415
    assert post_image(client, b"\x89PNG\r\n\x1a\n" + b"garbage" * 20).status_code == 415  # corrupt
    assert post_image(client, b"").status_code == 415

    monkeypatch.setattr(ocr_mod, "MAX_PIXELS", 10_000)
    assert post_image(client, png).status_code == 415                              # decompression-bomb guard


def test_oversized_upload_is_rejected(client, monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "max_upload_bytes", 1000)
    r = post_image(client, png_with_text())
    assert r.status_code == 413


def test_huge_declared_dimensions_rejected(client):
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", 60000, 60000, 8, 0, 0, 0, 0)
    bomb = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"\x00" * 100)) + chunk(b"IEND", b"")
    assert post_image(client, bomb).status_code == 415


def test_attach_requires_profile_and_ownership(client, profile):
    assert client.post(f"{API}/forensics/text", json={"text": "hello", "case_id": "x"}).status_code == 401
    assert client.post(f"{API}/forensics/text", json={"text": "hello", "case_id": "nope"},
                       headers=profile["headers"]).status_code == 404


def test_findings_feed_the_case(client, profile):
    h = profile["headers"]
    case = client.post(f"{API}/cases", json={"title": "From forensics"}, headers=h).json()
    b = client.post(f"{API}/forensics/text", json={"text": " ".join(SCAM_LINES), "case_id": case["id"]}, headers=h).json()
    assert b["stored"] and b["case_update"]["events_added"] == 1
    assert b["case_update"]["alert"]["action"] == "new"
    again = client.post(f"{API}/forensics/text", json={"text": " ".join(SCAM_LINES), "case_id": case["id"]}, headers=h).json()
    assert again["case_update"]["duplicates"] == 1 and again["case_update"]["alert"]["action"] == "suppressed"
    detail = client.get(f"{API}/cases/{case['id']}", headers=h).json()
    assert len(detail["events"]) == 1 and "482913" not in detail["events"][0]["excerpt"]


@pytest.mark.skipif(not HAS_TESSERACT, reason="Tesseract is not installed")
def test_screenshot_feeds_the_case_without_storing_the_image(client, profile):
    h = profile["headers"]
    case = client.post(f"{API}/cases", json={"title": "Screenshot"}, headers=h).json()
    r = post_image(client, png_with_text(), headers=h, params=f"?case_id={case['id']}&channel=sms")
    assert r.status_code == 200 and r.json()["stored"]
    ev = client.get(f"{API}/cases/{case['id']}", headers=h).json()["events"][0]
    assert ev["kind"] == "screenshot" and ev["media"]["sha256"] and ev["media"]["ocr_status"]
    assert "data" not in ev["media"] and "482913" not in ev["excerpt"]
