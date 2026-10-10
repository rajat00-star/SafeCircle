"""Builds the HackBriven idea document (docs/submission/SafeCircle-Guardian-Idea.docx)."""
import json
from pathlib import Path

from docx import Document
from docx.shared import Inches, Pt

ROOT = Path(__file__).resolve().parents[2]
S = json.loads((ROOT / "backend/app/detector/models/evaluation_summary.json").read_text())["metrics"]
doc = Document()
doc.styles["Normal"].font.name = "Calibri"
doc.styles["Normal"].font.size = Pt(11)

doc.add_heading("SafeCircle Guardian: Idea Document", 0)
doc.add_paragraph("HackBriven 2026 · Track: Cybersecurity & Digital Trust").runs[0].italic = True

sections = [
    ("One-line pitch", ["A scam checker that shows the evidence, says what to do, and lets you ask someone you trust, without reading your phone."]),
    ("Problem", [
        "In 2025 the US FTC recorded $15.9 billion in reported fraud losses from 3 million reports, and the FBI's IC3 received "
        "1,008,597 complaints describing nearly $21 billion in losses (FTC press release, 25 Mar 2026; FBI press release, 6 Apr 2026).",
        "Most scams manipulate people, not software: urgency, a trusted name, a request for an OTP or PIN, payment pressure, "
        "threats and secrecy. Existing filters give a bare 'spam' label or nothing at all, and the people victims turn to for "
        "advice have no context."]),
    ("Target users", [
        "Older adults and families receiving bank, delivery and 'new number' scams.",
        "First-time digital payment users (UPI, OTPs).",
        "Trusted helpers (children, carers, friends) who get asked 'is this real?'."]),
    ("Solution", [
        "Check: paste a message or link in the web app, or right-click in the browser extension. Links are never opened.",
        "Understand: a 0–100 score, the exact risky words highlighted, plain-language reasons for each of 12 tactics, and concrete next steps including reporting channels.",
        "Ask: send a summary to a trusted contact who accepted an invitation. Consent is two-sided, revocable and logged."]),
    ("How it works", [
        "Detector: normalisation against hidden and look-alike characters; 15 tactic rules with safety-advice negation; 21 static link signals "
        "(brand impersonation, typosquatting, IP hosts, shorteners, free hosting…); a local text model and a local domain model. About 1 ms per message on a CPU; no paid AI API.",
        "Stack: FastAPI, SQLAlchemy and Alembic on PostgreSQL; Next.js + TypeScript dashboard; Manifest V3 extension; Docker.",
        "Optional: a Claude-written summary that only sees redacted findings and can never change the score."]),
    ("Differentiators", [
        "Explainable by construction: every finding points to evidence.",
        "Recognises safety advice ('never share your OTP'), so genuine bank messages score low.",
        "Privacy first: nothing stored by default, redacted sharing, export and delete, content-free logs.",
        "Human-in-the-loop safety net with real consent instead of covert monitoring.",
        "Honest about limits: does not claim to read SMS, calls or chats, which mobile platforms restrict."]),
    ("Measured results (held-out data)", [
        f"Messages (SMS Spam Collection test split, 1,115 SMS): precision {S['hybrid@30']['precision']:.3f}, recall {S['hybrid@30']['recall']:.3f}, "
        f"F1 {S['hybrid@30']['f1']:.3f}, false-positive rate {S['hybrid@30']['false_positive_rate'] * 100:.2f}%.",
        f"Links (5,000 phishing vs 5,000 benign): precision {S['url_full_url']['precision']:.3f}, recall {S['url_full_url']['recall']:.3f}, "
        f"F1 {S['url_full_url']['f1']:.3f}, false-positive rate {S['url_full_url']['false_positive_rate'] * 100:.2f}%.",
        "Limits: the SMS data is 2011 spam rather than modern scams, and the benign link sample is hostnames only. Full protocol in the research paper."]),
    ("Feasibility and status", [
        "Working today: web app, API, browser extension, consent workflow, privacy controls, evaluation pipeline.",
        "Quality: 63 automated backend tests (SQLite and PostgreSQL), 18-step browser end-to-end test, extension test."]),
    ("Roadmap", [
        "Hindi and Hinglish rules; OCR for screenshots; a licensed scam-specific dataset; user study.",
        "Android share-sheet app and iOS message-filter extension within platform permissions; email/push alerts with the same consent model."]),
]
for title, items in sections:
    doc.add_heading(title, 1)
    for it in items:
        doc.add_paragraph(it, style="List Bullet" if len(items) > 1 else None)

doc.add_heading("Screenshot", 1)
doc.add_picture(str(ROOT / "slides/img/result.png"), width=Inches(5.8))
out = ROOT / "docs/submission/SafeCircle-Guardian-Idea.docx"
doc.save(out)
print("wrote", out)
