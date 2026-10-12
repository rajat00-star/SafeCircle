"""Financial scam tactic taxonomy and per-event detection.

This layer sits on top of the existing message/link detector (app.detector),
which is left unchanged so its published evaluation stays valid. It maps the
detector's categories onto a financial attack-chain taxonomy and adds
transparent rules for UPI, banking and wallet-specific tactics (collect
requests, PIN-to-receive tricks, payment diversion, digital arrest).

Every tactic carries the exact text that triggered it. Severities are
expert-set heuristics, not fitted probabilities.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..detector.engine import analyze_message, analyze_single_url
from ..detector.normalize import normalize
from ..detector.rules import _NEGATION_BEFORE
from ..detector.url_analyzer import BRANDS


@dataclass(frozen=True)
class Stage:
    code: str
    title: str
    order: int
    description: str


STAGES: dict[str, Stage] = {s.code: s for s in [
    Stage("hook", "Approach", 1, "The scammer makes contact and borrows a trusted identity or a lure."),
    Stage("pressure", "Pressure", 2, "Fear, urgency or authority is used to stop the victim from thinking or checking."),
    Stage("harvest", "Harvest", 3, "The victim is pushed to reveal codes, PINs, passwords or to log in on a fake page."),
    Stage("control", "Control", 4, "The scammer tries to take control of the victim's device."),
    Stage("extraction", "Extraction", 5, "Money is moved: collect requests, transfers, fees or diverted payments."),
    Stage("evasion", "Evasion", 0, "Tricks used to slip past filters. Not part of the victim-facing sequence."),
]}

# Stages that form the victim-facing sequence, in typical order.
CHAIN_STAGES = ["hook", "pressure", "harvest", "control", "extraction"]


@dataclass(frozen=True)
class Tactic:
    code: str
    title: str
    stage: str
    severity: float
    explanation: str
    recommendation: str


TACTICS: dict[str, Tactic] = {t.code: t for t in [
    Tactic("authority_impersonation", "Claims to be a bank, payment app or government body", "hook", 0.15,
           "The message names a bank, payment app, regulator or government body as its sender or subject. "
           "Genuine notices do this too; it matters when combined with pressure or a request.",
           "Contact the organisation through its official app or the number printed on your card, never through details in the message."),
    Tactic("family_impersonation", "Unknown number claiming to be family", "hook", 0.30,
           "A new or unknown number claims to be a relative or friend.",
           "Call the person on the number you already have saved for them."),
    Tactic("reward_lure", "Reward, refund or cashback lure", "hook", 0.25,
           "An unexpected prize, refund, cashback or guaranteed return is offered.",
           "Do not pay a fee or enter a PIN to receive a reward. Genuine refunds never need your PIN."),
    Tactic("kyc_suspension", "KYC or account-suspension threat", "pressure", 0.35,
           "The message says your KYC has expired or your account, card or wallet will be blocked.",
           "Banks do not block accounts through SMS links. Check KYC status only in the official app or at a branch."),
    Tactic("digital_arrest", "Digital arrest or coercive authority", "pressure", 0.55,
           "Claims of police, CBI, customs or court action, a 'digital arrest', or pressure to stay on a video call.",
           "No Indian agency arrests anyone over a video call or asks for money to settle a case. Hang up and call 1930."),
    Tactic("threat", "Threat or penalty", "pressure", 0.25,
           "Threats of fines, disconnection or legal action are used to scare you.",
           "Do not respond to threats. Verify through the organisation's official channel."),
    Tactic("urgency", "Urgency or time pressure", "pressure", 0.15,
           "A deadline or 'act now' language pushes you to act before checking.",
           "Slow down. Genuine organisations give you time to verify."),
    Tactic("secrecy", "Asks for secrecy", "pressure", 0.30,
           "You are told not to tell family, friends or your bank.",
           "Tell someone you trust before acting. Secrecy is how scammers stop others from warning you."),
    Tactic("credential_request", "Asks you to log in or confirm details", "harvest", 0.30,
           "You are asked to verify, update or confirm account, card or identity details.",
           "Do not enter details from a link in a message. Open the official app or type the address yourself."),
    Tactic("credential_link", "Suspicious login or credential-harvesting link", "harvest", 0.45,
           "A link with warning signs points to a login, KYC or verification page on a domain the brand does not own.",
           "Do not open the link. If you already entered details, change your password and call your bank."),
    Tactic("suspicious_link", "Suspicious link", "harvest", 0.30,
           "A link has structural warning signs (look-alike domain, shortener, raw IP, risky download).",
           "Do not open the link. Reach the service by typing its known address."),
    Tactic("secret_request", "Asks for an OTP, PIN or password", "harvest", 0.60,
           "The message asks you to share or enter a one-time code, UPI PIN, card PIN, CVV or password.",
           "Never share an OTP, PIN or password. If you already did, call your bank now to block the account or card."),
    Tactic("remote_access", "Remote-access or screen-sharing request", "control", 0.55,
           "You are asked to install AnyDesk, TeamViewer, a screen-sharing app or an unknown APK.",
           "Do not install apps on request. Uninstall any remote-access app and disconnect from the internet."),
    Tactic("upi_collect", "UPI collect-request or PIN-to-receive trick", "extraction", 0.60,
           "You are told to approve a request, scan a QR code or enter your UPI PIN to receive money. "
           "A UPI PIN is only ever needed to send money, never to receive it.",
           "Decline the collect request. You never need your UPI PIN or a QR scan to receive money."),
    Tactic("payment_diversion", "Payment diversion or transfer to a 'safe' account", "extraction", 0.50,
           "You are asked to pay into a new, changed or 'safe' account, or to a specific UPI ID.",
           "Do not transfer money. Confirm any change of payment details by calling a number you already know."),
    Tactic("payment_pressure", "Pressure to pay or move money", "extraction", 0.35,
           "You are pushed to pay a fee, fine, deposit or transfer.",
           "Do not pay. Check the request through a channel you find yourself."),
    Tactic("obfuscation", "Disguised characters", "evasion", 0.25,
           "Invisible characters or look-alike letters are used to fake names or slip past filters.",
           "Treat names and links in this message as untrustworthy."),
    Tactic("ai_manipulation", "Hidden instructions aimed at filters", "evasion", 0.35,
           "The text contains instructions aimed at automated scanners.",
           "Treat the message with extra caution."),
    Tactic("repeated_indicator", "Repeated suspicious link, domain or message pattern", "evasion", 0.20,
           "The same suspicious domain, payment handle or message template appears in more than one piece of evidence.",
           "Repeated indicators suggest an organised attempt. Block the sender and report the details."),
]}

# Base detector category -> tactic code.
_BASE_MAP = {
    "impersonation": "authority_impersonation", "family_impersonation": "family_impersonation",
    "reward_lure": "reward_lure", "urgency": "urgency", "secrecy": "secrecy",
    "otp_request": "secret_request", "credential_request": "credential_request",
    "payment_pressure": "payment_pressure", "remote_access": "remote_access",
    "obfuscation": "obfuscation", "ai_manipulation": "ai_manipulation", "threat": "threat",
}


def _p(*alts: str) -> str:
    return r"(?:" + "|".join(alts) + r")"


_UPI_HANDLE = r"[a-z0-9][a-z0-9._-]{1,48}@(?:ybl|ibl|axl|okaxis|oksbi|okhdfcbank|okicici|paytm|upi|apl|yapl|axisbank|icici|sbi|hdfcbank|kotak|freecharge|airtel|jio|pthdfc|ptsbi|ptaxis|ptyes)"

# (rule_id, tactic, pattern) on normalised lower-case text.
FINANCIAL_RULES: list[tuple[str, str, re.Pattern[str]]] = [
    ("upi_collect_request", "upi_collect", re.compile(
        r"\b" + _p(r"collect request", r"payment request (?:sent|from|on your)", r"(?:approve|accept|authori[sz]e) (?:the |this |my )?(?:payment |collect |upi )?request",
                   r"request money", r"money request", r"sent (?:you )?a (?:payment|collect|money|upi) request",
                   r"approve (?:it|this|the payment) to (?:return|refund|receive|get)") + r"\b")),
    ("upi_pin_to_receive", "upi_collect", re.compile(
        r"\b(?:enter|type|put|use)\b[^.!?\n]{0,30}?\b(?:upi )?(?:pin|mpin)\b[^.!?\n]{0,40}?\b(?:receive|get|credit|claim|refund|cashback)"
        r"|\b(?:to )?(?:receive|get|claim)\b[^.!?\n]{0,40}?\b(?:enter|type|share)\b[^.!?\n]{0,20}?\b(?:upi )?(?:pin|mpin)\b")),
    ("upi_qr_receive", "upi_collect", re.compile(
        r"\bscan\b[^.!?\n]{0,30}?\bqr\b[^.!?\n]{0,40}?\b(?:receive|get|credit|claim|refund|cashback|prize)")),
    # Same idea as the base OTP rule, but negation is only honoured inside the same sentence, so copied
    # safety advice ("Bank will never ask for your PIN.") cannot hide the request that follows it.
    ("secret_share_code", "secret_request", re.compile(
        r"\b(?:share|send|tell|give|forward|enter|type|read out)\b[^.!?\n]{0,30}?\b(?:otp|one[- ]time (?:password|code)|verification code|security code|cvv|code (?:we|i) sent|code you (?:just )?received)\b")),
    ("secret_upi_pin", "secret_request", re.compile(
        r"\b(?:share|send|tell|give|enter|type|confirm)\b[^.!?\n]{0,30}?\b(?:upi pin|mpin|atm pin|card pin|net ?banking password|transaction password)\b")),
    ("div_new_account", "payment_diversion", re.compile(
        r"\b" + _p(r"(?:new|updated|changed|different|alternate) (?:bank )?(?:account|a/c|upi id)(?: details| number)?",
                   r"safe (?:account|vault)", r"secure (?:rbi |government )?account", r"rbi (?:safe |secure )?account",
                   r"verification (?:amount|deposit|payment)", r"(?:security|refundable) deposit",
                   r"(?:transfer|move|send|deposit) (?:all |your )?(?:the )?(?:money|funds|savings|balance|amount) (?:to|into) (?:this|the following|a safe|a secure|our|my)") + r"\b")),
    ("div_pay_to_handle", "payment_diversion", re.compile(
        r"\b(?:pay|send|transfer)\b[^.!?\n]{0,40}?" + _UPI_HANDLE)),
    ("arrest_digital", "digital_arrest", re.compile(
        r"\b" + _p(r"digital arrest", r"arrest warrant", r"money laundering", r"narcotics", r"\bncb\b", r"\bcbi\b",
                   r"enforcement directorate", r"crime branch", r"(?:drugs?|illegal items?) (?:found|seized|parcel|package)",
                   r"(?:parcel|package) (?:contains|containing|with) (?:drugs|narcotics|illegal)",
                   r"stay on (?:the )?(?:video )?call", r"(?:do not|don'?t) (?:disconnect|cut) (?:the )?call",
                   r"(?:video|skype) (?:call )?(?:statement|interrogation|verification)",
                   r"aadhaa?r (?:has been |is |was )?(?:misused|used in|linked to)") + r"\b")),
    ("kyc_expired", "kyc_suspension", re.compile(
        r"\bkyc\b[^.!?\n]{0,30}?\b(?:expired?|pending|incomplete|suspend|block|not updated|deactivat)"
        r"|\b(?:account|card|wallet|upi|sim|pan)\b[^.!?\n]{0,30}?\b(?:will be |has been |is |to be )?(?:suspended|blocked|deactivated|frozen|closed|restricted|locked)\b")),
    ("remote_screen_call", "remote_access", re.compile(
        r"\bshare (?:your )?screen\b|\bscreen ?share\b|\bremote (?:app|control)\b")),
]

# Safety advice phrases that genuine notifications contain.
_SAFETY_ADVICE = re.compile(
    r"\b(?:never|do not|don'?t|not to)\b[^.!?\n]{0,25}?\bshare\b[^.!?\n]{0,25}?\b(?:otp|pin|password|cvv|code)\b"
    r"|\b(?:bank|we|staff)\b[^.!?\n]{0,20}?\b(?:will )?never ask\b"
    r"|\bif (?:this was )?not (?:done by )?you\b[^.!?\n]{0,40}?\b(?:call|contact|report)\b")

# A message telling the reader to disregard an earlier one. Recorded, never trusted: a newer message is not
# more reliable because it is newer, so this only feeds conflict detection and never lowers a score.
_RETRACTION = re.compile(
    r"\b(?:ignore|disregard)\b[^.!?\n]{0,25}?\b(?:earlier|previous|last|above|prior|old|first)\b[^.!?\n]{0,15}?"
    r"\b(?:message|msg|sms|e-?mail|mail|text|link|notice|call)s?\b")

# Organisation names -> canonical keys. Used for "claimed identity" and campaign correlation.
ORG_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (key, re.compile(r"\b(?:" + pat + r")\b")) for key, pat in [
        ("sbi", r"sbi|state bank"), ("hdfc", r"hdfc"), ("icici", r"icici"), ("axisbank", r"axis bank"),
        ("kotak", r"kotak"), ("paytm", r"paytm"), ("phonepe", r"phonepe"), ("gpay", r"google pay|gpay"),
        ("npci", r"npci|bhim"), ("rbi", r"rbi|reserve bank"), ("cbi", r"cbi|central bureau"),
        ("ed", r"enforcement directorate"), ("ncb", r"ncb|narcotics"), ("customs", r"customs"),
        ("police", r"police|cyber ?cell|crime branch"), ("trai", r"trai"), ("incometax", r"income ?tax"),
        ("indiapost", r"india ?post"), ("fedex", r"fedex"), ("dhl", r"dhl"), ("amazon", r"amazon"),
        ("flipkart", r"flipkart"), ("electricity", r"electricity (?:board|department|office)"),
    ]
]
ORG_TO_BRAND = {"sbi": "sbi", "hdfc": "hdfc", "icici": "icici", "axisbank": "axisbank", "kotak": "kotak",
                "paytm": "paytm", "phonepe": "phonepe", "gpay": "google", "indiapost": "indiapost",
                "fedex": "fedex", "dhl": "dhl", "amazon": "amazon", "flipkart": "flipkart"}

# Base-detector matches that are only a mention, not a tactic, in a financial context
# ("UPI" alone is not payment pressure; "KYC" alone is not an organisation).
_WEAK_BASE_EVIDENCE = {"payment_pressure": ("upi",), "impersonation": ("kyc",)}
_DIGITAL_ARREST_BASE =re.compile(r"arrest|laundering|drug|narcotic")
# Tactics that ask the victim to do something risky. Their presence cancels the safety-advice discount.
REQUEST_TACTICS = {"secret_request", "upi_collect", "payment_diversion", "payment_pressure", "credential_link",
                   "suspicious_link", "remote_access", "digital_arrest", "family_impersonation"}
_CREDENTIAL_URL_SIGNALS = {"brand_in_host", "brand_in_path", "typosquat", "sensitive_path", "userinfo_trick",
                           "punycode", "confusable_chars"}


@dataclass
class TacticHit:
    code: str
    evidence: list[dict] = field(default_factory=list)   # {text, start, end, rule}
    strength: float = 1.0                                 # 1.0 for a direct text match; link score for link tactics
    basis: str = "text_match"                             # text_match | link_structure

    def add(self, text: str, start: int | None, end: int | None, rule: str) -> None:
        if len(self.evidence) >= 4 or any(e["text"].lower() == text.lower() for e in self.evidence):
            return
        self.evidence.append({"text": text, "start": start, "end": end, "rule": rule})

    @property
    def severity(self) -> float:
        return round(TACTICS[self.code].severity * self.strength, 3)


@dataclass
class EventDetection:
    tactics: dict[str, TacticHit]
    urls: list[dict]
    ml_probability: float | None
    base_score: int
    safety_advice: list[str]
    claimed_orgs: list[str]
    text_length: int
    mitigation: str | None = None
    retraction: list[str] = field(default_factory=list)

    @property
    def score(self) -> float:
        p = 1.0
        for h in self.tactics.values():
            p *= 1.0 - h.severity
        return 1.0 - p


def _negated_in_sentence(text: str, start: int) -> bool:
    """Negation ("never share your OTP") counts only within the sentence that contains the match."""
    window = text[max(0, start - 40):start]
    window = re.split(r"[.!?\n]", window)[-1]
    return bool(_NEGATION_BEFORE.search(window))


def _hit(tactics: dict[str, TacticHit], code: str, basis: str = "text_match") -> TacticHit:
    return tactics.setdefault(code, TacticHit(code, basis=basis))


def detect_text(text: str) -> EventDetection:
    """Detect tactics in a message (or OCR'd screenshot text). Runs in memory; stores nothing."""
    base = analyze_message(text)
    tactics: dict[str, TacticHit] = {}

    for cat in base.categories:
        if cat.code == "suspicious_link":
            continue
        for ev in cat.evidence:
            code = _BASE_MAP.get(cat.code)
            if code is None or ev["text"].strip().lower() in _WEAK_BASE_EVIDENCE.get(cat.code, ()):
                continue
            if cat.code == "threat" and _DIGITAL_ARREST_BASE.search(ev["text"].lower()):
                code = "digital_arrest"
            _hit(tactics, code).add(ev["text"], ev["start"], ev["end"], ev["rule"])

    nt = normalize(text)
    for rule_id, code, pattern in FINANCIAL_RULES:
        for m in pattern.finditer(nt.text):
            if m.end() == m.start():
                continue
            if code in ("secret_request", "upi_collect") and _negated_in_sentence(nt.text, m.start()):
                continue
            s, e = nt.span_to_original(m.start(), m.end())
            _hit(tactics, code).add(nt.original[s:e], s, e, rule_id)

    # Generic threats already explained by a more specific tactic add nothing new.
    if "threat" in tactics and ("kyc_suspension" in tactics or "digital_arrest" in tactics):
        specific = {e["text"].lower() for c in ("kyc_suspension", "digital_arrest") if c in tactics for e in tactics[c].evidence}
        tactics["threat"].evidence = [e for e in tactics["threat"].evidence
                                      if not any(e["text"].lower() in s or s in e["text"].lower() for s in specific)]
        if not tactics["threat"].evidence:
            del tactics["threat"]

    _add_link_tactics(tactics, base.urls, credential_context=bool({"credential_request", "kyc_suspension",
                                                                    "secret_request"} & set(tactics)))
    advice = [m.group(0) for m in _SAFETY_ADVICE.finditer(nt.text)][:3]
    mitigation = None
    if advice and tactics and not (set(tactics) & REQUEST_TACTICS):
        # Genuine notices name the bank and give safety advice but ask for nothing. Halve the weights
        # in that case; any request (code, link, payment, app) cancels the discount.
        for h in tactics.values():
            h.strength *= 0.5
        mitigation = "Contains safety advice and makes no request, so its signal weights are halved."
    return EventDetection(
        tactics=tactics, urls=base.urls,
        ml_probability=base.ml["probability"] if base.ml else None,
        base_score=base.risk_score, safety_advice=advice,
        claimed_orgs=claimed_orgs(nt.text), text_length=len(text.strip()), mitigation=mitigation,
        retraction=[m.group(0) for m in _RETRACTION.finditer(nt.text)][:2],
    )


def detect_url(url: str) -> EventDetection:
    """Static inspection of a single link. The link is never fetched."""
    base = analyze_single_url(url)
    tactics: dict[str, TacticHit] = {}
    _add_link_tactics(tactics, base.urls, credential_context=False)
    host = base.urls[0]["hostname"] if base.urls else ""
    return EventDetection(tactics=tactics, urls=base.urls, ml_probability=None, base_score=base.risk_score,
                          safety_advice=[], claimed_orgs=claimed_orgs(host.replace("-", " ").replace(".", " ")),
                          text_length=len(url.strip()))


def _add_link_tactics(tactics: dict[str, TacticHit], urls: list[dict], credential_context: bool) -> None:
    for u in urls:
        score = u["risk_score"] / 100
        if score < 0.35:
            continue
        codes = {s["code"] for s in u["signals"]}
        tactic = "credential_link" if (codes & _CREDENTIAL_URL_SIGNALS or credential_context) else "suspicious_link"
        hit = _hit(tactics, tactic, basis="link_structure")
        hit.strength = max(hit.strength if hit.evidence else 0.0, min(1.0, score + 0.2))
        hit.add(u["url"], u["start"], u["end"], "url:" + ",".join(sorted(codes))[:60])
    if "credential_link" in tactics and "suspicious_link" in tactics:
        for e in tactics.pop("suspicious_link").evidence:
            tactics["credential_link"].add(e["text"], e["start"], e["end"], e["rule"])


def claimed_orgs(lowered_text: str) -> list[str]:
    return [key for key, pat in ORG_PATTERNS if pat.search(lowered_text)]


def official_domains(org: str) -> set[str]:
    brand = ORG_TO_BRAND.get(org)
    return set(BRANDS.get(brand, set())) if brand else set()
