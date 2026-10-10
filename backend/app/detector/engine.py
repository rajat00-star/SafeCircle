"""Hybrid detector: rules + static URL analysis + local ML, with explanations."""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field

from .ml import load_model
from .normalize import normalize
from .rules import CATEGORIES, run_rules, score_categories
from .url_analyzer import UrlAnalysis, analyze_url, extract_urls

ENGINE_VERSION = "1.0.0"

# Score thresholds (0-100). Chosen on the training split only; see docs/methodology.md.
MEDIUM_THRESHOLD = 30
HIGH_THRESHOLD = 60
ML_WEIGHT = 0.6
URL_CATEGORY_THRESHOLD = 0.35

RECOMMENDATIONS: dict[str, str] = {
    "otp_request": "Never share a one-time code, PIN or CVV with anyone, even someone claiming to be your bank. "
                   "If you already shared one, call your bank on the number printed on your card now.",
    "credential_request": "Don't enter passwords or personal details from a link in a message. Open the official app "
                          "or type the website address yourself.",
    "payment_pressure": "Don't send money, gift cards or crypto. Check the request through a phone number or website "
                        "you find yourself, not one in the message.",
    "impersonation": "Contact the organisation directly using contact details from its official website, app or your card. "
                     "Don't use numbers or links from the message.",
    "family_impersonation": "Call the person on the number you already have saved for them before doing anything.",
    "threat": "Government agencies and banks don't threaten arrest or account closure by text or chat. Don't respond to threats.",
    "secrecy": "Talk to someone you trust before acting. Scammers ask for secrecy so nobody can warn you.",
    "reward_lure": "Unexpected prizes, refunds and guaranteed returns are bait. Don't pay a fee to collect a reward.",
    "remote_access": "Don't install apps or share your screen at someone's request. Uninstall any remote-access app you "
                     "installed and disconnect from the internet if someone has control of your device.",
    "suspicious_link": "Don't open the link. If you need the service, go to it by typing its known address or using its official app.",
    "ai_manipulation": "This message tries to trick automated filters. Treat it with extra caution.",
    "obfuscation": "Hidden or look-alike characters are a deliberate disguise. Don't trust names or links in this message.",
    "urgency": "Slow down. Genuine organisations give you time to check. Pressure to act now is a warning sign.",
}

REPORTING_TIPS = [
    "India: report at cybercrime.gov.in or call 1930 (National Cyber Crime Helpline).",
    "US: report at reportfraud.ftc.gov. UK: forward scam texts to 7726 and emails to report@phishing.gov.uk.",
]


@dataclass
class CategoryFinding:
    code: str
    title: str
    explanation: str
    weight: float
    evidence: list[dict] = field(default_factory=list)


@dataclass
class AnalysisResult:
    kind: str
    risk_score: int
    risk_level: str
    verdict: str
    categories: list[CategoryFinding]
    combinations: list[str]
    urls: list[dict]
    ml: dict | None
    recommendations: list[str]
    redacted_excerpt: str
    engine_version: str
    processing_ms: float

    @property
    def category_codes(self) -> list[str]:
        return [c.code for c in self.categories]


def _level(score: int) -> tuple[str, str]:
    if score >= HIGH_THRESHOLD:
        return "high", "High risk: this looks like a scam."
    if score >= MEDIUM_THRESHOLD:
        return "medium", "Suspicious: check carefully before acting."
    return "low", "No strong scam signals found."


_REDACTIONS = [
    (re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"), "[email]"),
    (re.compile(r"\b(?:\d[ -]?){12,19}\b"), "[card/account number]"),
    (re.compile(r"\+?\d[\d\s-]{8,}\d"), "[phone number]"),
    (re.compile(r"\b\d{4,8}\b"), "[code]"),
]


def redact(text: str, max_len: int = 280) -> str:
    """Remove the most sensitive tokens (codes, card numbers, phones, emails) for sharing."""
    out = text
    for pattern, repl in _REDACTIONS:
        out = pattern.sub(repl, out)
    out = re.sub(r"\s+", " ", out).strip()
    return out[: max_len - 1] + "…" if len(out) > max_len else out


def _url_to_dict(u: UrlAnalysis, start: int | None = None, end: int | None = None) -> dict:
    return {
        "url": u.url,
        "hostname": u.hostname,
        "registered_domain": u.registered_domain,
        "risk_score": round(u.score * 100),
        "signals": [{"code": s.code, "title": s.title, "detail": s.detail, "weight": s.weight} for s in u.signals],
        "start": start,
        "end": end,
    }


def _recommendations(codes: list[str], level: str) -> list[str]:
    priority = ["otp_request", "remote_access", "payment_pressure", "credential_request", "suspicious_link",
                "family_impersonation", "impersonation", "threat", "secrecy", "reward_lure", "obfuscation",
                "ai_manipulation", "urgency"]
    recs = [RECOMMENDATIONS[c] for c in priority if c in codes]
    if level == "low":
        recs.append("No strong warning signs, but stay careful: never share codes or passwords, and verify any "
                    "request for money through a channel you already trust.")
    else:
        recs.extend(REPORTING_TIPS)
    return recs[:7]


def analyze_message(text: str, use_ml: bool = True) -> AnalysisResult:
    t0 = time.perf_counter()
    nt = normalize(text)
    rr = run_rules(nt)

    findings: dict[str, CategoryFinding] = {}
    for ev in rr.evidence:
        cat = CATEGORIES[ev.category]
        f = findings.setdefault(cat.code, CategoryFinding(cat.code, cat.title, cat.explanation, cat.weight))
        if len(f.evidence) < 4 and all(e["text"].lower() != ev.matched_text.lower() for e in f.evidence):
            f.evidence.append({"text": ev.matched_text, "start": ev.start, "end": ev.end, "rule": ev.rule_id})

    rule_score, combos = score_categories(list(findings))

    urls = []
    url_score = 0.0
    for raw, start, end in extract_urls(nt.original):
        ua = analyze_url(raw)
        urls.append(_url_to_dict(ua, start, end))
        url_score = max(url_score, ua.score)
    if urls and url_score >= URL_CATEGORY_THRESHOLD:
        worst = max(urls, key=lambda u: u["risk_score"])
        findings["suspicious_link"] = CategoryFinding(
            "suspicious_link", "Suspicious link", "A link in the message has warning signs: "
            + "; ".join(s["title"].lower() for s in worst["signals"][:3]) + ".",
            round(url_score, 2),
            [{"text": u["url"], "start": u["start"], "end": u["end"], "rule": "url"} for u in urls if u["risk_score"] >= 35][:4],
        )

    ml_info = None
    ml_prob = 0.0
    model = load_model() if use_ml else None
    if model is not None:
        mr = model.predict(nt.text)
        ml_prob = mr.probability
        ml_info = {"probability": round(mr.probability, 4), "top_terms": [t for t, _ in mr.top_terms],
                   "model_version": model.version}

    combined = 1.0 - (1.0 - rule_score) * (1.0 - url_score) * (1.0 - ML_WEIGHT * ml_prob)
    score = int(round(combined * 100))
    level, verdict = _level(score)
    cats = sorted(findings.values(), key=lambda f: f.weight, reverse=True)
    codes = [c.code for c in cats]
    return AnalysisResult(
        kind="message",
        risk_score=score,
        risk_level=level,
        verdict=verdict,
        categories=cats,
        combinations=combos,
        urls=urls,
        ml=ml_info,
        recommendations=_recommendations(codes, level),
        redacted_excerpt=redact(text),
        engine_version=ENGINE_VERSION,
        processing_ms=round((time.perf_counter() - t0) * 1000, 2),
    )


def analyze_single_url(url: str) -> AnalysisResult:
    t0 = time.perf_counter()
    ua = analyze_url(url)
    score = int(round(ua.score * 100))
    level, verdict = _level(score)
    cats: list[CategoryFinding] = []
    if ua.signals:
        cats.append(CategoryFinding("suspicious_link", "Suspicious link",
                                    "The link has warning signs listed below.", round(ua.score, 2),
                                    [{"text": s.title, "start": None, "end": None, "rule": s.code} for s in ua.signals]))
    codes = ["suspicious_link"] if level != "low" else []
    if level == "low":
        verdict = "No warning signs in the address itself. Address checks can't prove a site is safe."
    if not ua.valid:
        verdict = "This doesn't look like a valid web address."
    return AnalysisResult(
        kind="url", risk_score=score, risk_level=level, verdict=verdict, categories=cats, combinations=[],
        urls=[_url_to_dict(ua)], ml=None, recommendations=_recommendations(codes, level),
        redacted_excerpt=redact(url, 200), engine_version=ENGINE_VERSION,
        processing_ms=round((time.perf_counter() - t0) * 1000, 2),
    )
