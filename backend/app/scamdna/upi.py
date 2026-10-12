"""UPI Scam Guard: inspect a UPI ID or a UPI payment link (as found in a QR code) before paying.

Everything here is static inspection of what the user pasted or scanned:
  - the payee handle, payee name, amount and note inside a `upi://pay` link
  - the message that came with the request, run through the Scam DNA tactic rules
  - whether the same handle already appears in the user's own investigations (keyed hash)

What it cannot do, and never claims: look up who owns a handle, check a bank, NPCI or
any fraud database, or see, block or approve a real payment. A finding means
"warning signs present", never "this is fraud".
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from urllib.parse import parse_qs, urlsplit

from .evidence import _UPI_PSP, keyed_hash, mask_handle
from .tactics import EventDetection, TacticHit, claimed_orgs, detect_text

HANDLE = re.compile(r"^([a-z0-9][a-z0-9._-]{1,48})@([a-z][a-z0-9]{1,19})$", re.I)
# Payee names / handles that promise money or invoke an account problem.
_LURE_WORDS = re.compile(r"\b(?:refund|cashback|cash back|prize|reward|lottery|lucky|winner|bonus|claim|gift)\b", re.I)
_KYC_WORDS = re.compile(r"\b(?:kyc|verification|verify|suspend\w*|block\w*|unblock|penalty|fine|challan)\b", re.I)
_SUPPORT_WORDS = re.compile(r"\b(?:care|help|helpdesk|support|desk|officer|official|customer|service|department)\b", re.I)
_RECEIVE = re.compile(r"\b(?:receive|refund|cashback|cash back|credit(?:ed)?|prize|reward|get (?:the |your )?money|claim|"
                      r"get (?:your )?(?:payment|amount))\b", re.I)
LIMITATIONS = [
    "SafeCircle cannot see who owns a UPI handle; only your bank or UPI app shows the registered name.",
    "No bank, NPCI or fraud database is consulted. 'No warning signs' does not mean the payee is safe.",
    "Nothing is paid, blocked or approved here. You stay in control of your UPI app.",
]


class UpiParseError(ValueError):
    pass


@dataclass
class ParsedUpi:
    kind: str                       # handle | upi_link
    handle: str
    user: str
    psp: str
    payee_name: str | None = None
    amount: str | None = None
    currency: str | None = None
    note: str | None = None
    link_type: str | None = None    # pay | collect | other
    unknown_params: list[str] = field(default_factory=list)

    @property
    def masked(self) -> str:
        return mask_handle(self.user, self.psp)

    @property
    def psp_known(self) -> bool:
        return self.psp.lower() in _UPI_PSP


def _handle(value: str) -> tuple[str, str]:
    m = HANDLE.match(value.strip())
    if not m:
        raise UpiParseError("This is not a valid UPI ID. A UPI ID looks like name@bank, for example asha@okaxis.")
    return m.group(1).lower(), m.group(2).lower()


def _amount(raw: str) -> str:
    try:
        d = Decimal(raw)
    except InvalidOperation:
        raise UpiParseError("The amount in this payment link is not a number.")
    if d <= 0 or d > Decimal("10000000") or d.as_tuple().exponent < -2:
        raise UpiParseError("The amount in this payment link is not a valid rupee amount.")
    return f"{d:.2f}"


def parse_upi(text: str) -> ParsedUpi:
    """Accept a bare UPI ID or a upi:// link. Raises UpiParseError with a user-readable message."""
    s = text.strip()
    if not s:
        raise UpiParseError("Paste a UPI ID or a UPI payment link.")
    if len(s) > 2048:
        raise UpiParseError("That is too long to be a UPI ID or payment link.")
    if not s.lower().startswith("upi:"):
        user, psp = _handle(s)
        return ParsedUpi("handle", f"{user}@{psp}", user, psp)
    try:
        parts = urlsplit(s)
    except ValueError:
        raise UpiParseError("This UPI link is malformed.")
    action = (parts.netloc or parts.path.strip("/")).lower()
    q = {k.lower(): v[0] for k, v in parse_qs(parts.query, keep_blank_values=False, max_num_fields=30).items()}
    if "pa" not in q:
        raise UpiParseError("This UPI link has no payee address (pa=), so there is nothing to check.")
    user, psp = _handle(q["pa"])
    known = {"pa", "pn", "am", "cu", "tn", "tr", "tid", "mc", "mode", "purpose", "orgid", "sign", "url", "mam", "refurl"}
    pn = " ".join(q["pn"].split())[:100] if q.get("pn") else None
    tn = " ".join(q["tn"].split())[:200] if q.get("tn") else None
    return ParsedUpi(
        "upi_link", f"{user}@{psp}", user, psp, payee_name=pn,
        amount=_amount(q["am"]) if q.get("am") else None, currency=(q.get("cu") or "INR").upper()[:3], note=tn,
        link_type=action if action in ("pay", "collect") else "other",
        unknown_params=sorted(k for k in q if k not in known)[:5])


def _readable(s: str) -> str:
    return re.sub(r"[._-]+", " ", s).lower()


def upi_signals(p: ParsedUpi, context: str) -> tuple[list[dict], dict[str, TacticHit]]:
    """Signals from the request itself. Each says whether it is observed in the data or a heuristic."""
    signals: list[dict] = []
    hits: dict[str, TacticHit] = {}

    def hit(code: str, text: str, rule: str) -> None:
        hits.setdefault(code, TacticHit(code, basis="upi_request")).add(text, None, None, rule)

    user_words = _readable(p.user)
    for label, value in (("payee name", p.payee_name), ("UPI ID", user_words)):
        if not value:
            continue
        orgs = claimed_orgs(value.lower())
        # A merchant whose handle carries its own name (amazon@apl) is normal; a personal-app handle
        # whose display name claims a bank or agency is not.
        if label == "payee name":
            orgs = [o for o in orgs if o not in user_words.replace(" ", "")]
        elif not (_LURE_WORDS.search(value) or _KYC_WORDS.search(value) or _SUPPORT_WORDS.search(value)):
            orgs = []   # "amazon@apl" or "sbi@sbi" alone is how merchants and banks name their own handles
        if orgs:
            shown = p.payee_name if label == "payee name" else p.masked
            detail = (f"The {label} ({shown}) names {', '.join(o.upper() for o in orgs)}. Anyone can choose a display "
                      "name or handle; it does not prove who receives the money.")
            signals.append({"code": "org_name", "title": "Organisation name on a payee", "detail": detail, "basis": "heuristic"})
            hit("authority_impersonation", f"{label}: {shown}", "upi_payee_org")
        if _LURE_WORDS.search(value):
            signals.append({"code": "lure_name", "title": "Payee presented as a refund or reward",
                            "detail": f"The {label} mentions a refund, prize or reward. You never pay to receive money.",
                            "basis": "observed"})
            hit("reward_lure", f"{label}: {p.payee_name if label == 'payee name' else p.masked}", "upi_payee_lure")
        if _KYC_WORDS.search(value):
            signals.append({"code": "kyc_name", "title": "Payee presented as KYC, verification or a penalty",
                            "detail": f"The {label} refers to KYC, verification or a fine. Banks do not collect these by UPI request.",
                            "basis": "observed"})
            hit("kyc_suspension", f"{label}: {p.payee_name if label == 'payee name' else p.masked}", "upi_payee_kyc")

    receive_text = " ".join(x for x in (p.note, context) if x)
    if p.kind == "upi_link":
        if p.amount:
            signals.append({"code": "prefilled_amount", "title": f"Pre-filled amount: ₹{p.amount}",
                            "detail": f"Opening this link or scanning this QR asks you to PAY ₹{p.amount}. It cannot put money into your account.",
                            "basis": "observed"})
        m = _RECEIVE.search(receive_text)
        if m:
            signals.append({"code": "pay_to_receive", "title": "Told you will receive money, but the link sends money",
                            "detail": f"The request talks about '{m.group(0)}', but a UPI payment link only ever takes money from you.",
                            "basis": "observed"})
            hit("upi_collect", f"upi://{p.link_type} link with '{m.group(0)}'", "upi_link_receive")
        if p.link_type != "pay":
            signals.append({"code": "unusual_link", "title": "Unusual UPI link type",
                            "detail": f"This is a '{p.link_type}' link. QR codes for paying a shop normally use upi://pay.",
                            "basis": "heuristic"})
    if not p.psp_known:
        signals.append({"code": "unlisted_psp", "title": "Handle suffix not in SafeCircle's list",
                        "detail": f"@{p.psp} is not one of the common UPI handles SafeCircle knows. There are many genuine "
                                  "handles, so this alone is not a warning sign.", "basis": "heuristic"})
    return signals, hits


def request_text(p: ParsedUpi, context: str) -> str:
    """Plain-text form of the request, stored (redacted) when the check is attached to a case."""
    bits = [f"UPI {p.link_type or 'payment'} request details. Payee: {p.handle}."]
    if p.payee_name:
        bits.append(f"Payee name: {p.payee_name}.")
    if p.amount:
        bits.append(f"Amount: Rs {p.amount}.")
    if p.note:
        bits.append(f"Note: {p.note}.")
    if context.strip():
        bits.append("\n" + context.strip())
    return " ".join(bits)


def detect_upi(p: ParsedUpi, context: str) -> tuple[EventDetection, list[dict]]:
    """Tactic rules on the note and accompanying message, plus the UPI-specific signals."""
    text = "\n".join(x for x in (p.note, context.strip()) if x)
    det = detect_text(text) if text else EventDetection({}, [], None, 0, [], [], 0)
    signals, hits = upi_signals(p, context)
    for code, h in hits.items():
        if code in det.tactics:
            for e in h.evidence:
                det.tactics[code].add(e["text"], None, None, e["rule"])
        else:
            det.tactics[code] = h
    det.text_length = len(text)
    return det, signals


def handle_hash(p: ParsedUpi) -> str:
    return keyed_hash(p.handle)
