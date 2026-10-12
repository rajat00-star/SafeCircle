"""Redaction and indicator extraction for evidence that is stored in a case.

What is kept: the message with secrets removed, link addresses (without query
strings), and organisation names. What is never kept: OTPs, PINs, passwords,
CVVs, card or account numbers, phone numbers and e-mail addresses. Phone numbers
and UPI handles are kept only as keyed hashes (HMAC with the server secret) so
that repeated use can be correlated across cases without storing the value.
"""
from __future__ import annotations

import hashlib
import hmac
import re
from urllib.parse import urlsplit

from ..config import get_settings
from ..detector.url_analyzer import BRANDS, URL_SHORTENERS, extract_urls

_SECRET_WORDS = r"(?:otp|one[- ]time|pin|mpin|passcode|password|passwd|cvv|cvc|code|verification|auth)"
_SECRET_NEAR = re.compile(
    r"(?:\b" + _SECRET_WORDS + r"\b[^.!?\n]{0,30}?\b(\d{3,8})\b)|(?:\b(\d{3,8})\b[^.!?\n]{0,30}?\b" + _SECRET_WORDS + r"\b)",
    re.I)
_SECRET_ASSIGN = re.compile(r"\b(password|passwd|passcode|pin|mpin|cvv)\s*(?:is|:|=)\s*[^\s.,;]+", re.I)
_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
_LONG_NUMBER = re.compile(r"\+?\b(?:\d[ -]?){9,19}\b")
_PHONE = re.compile(r"(?<![\w/])\+?\d[\d\s-]{8,}\d(?![\w/])")
UPI_HANDLE = re.compile(r"\b([a-z0-9][a-z0-9._-]{1,48})@([a-z]{2,20})\b", re.I)
_UPI_PSP = {"ybl", "ibl", "axl", "okaxis", "oksbi", "okhdfcbank", "okicici", "paytm", "upi", "apl", "yapl",
            "axisbank", "icici", "sbi", "hdfcbank", "kotak", "freecharge", "airtel", "jio", "pthdfc", "ptsbi",
            "ptaxis", "ptyes"}


def keyed_hash(value: str) -> str:
    key = get_settings().secret_key.encode()
    return hmac.new(key, value.strip().lower().encode(), hashlib.sha256).hexdigest()[:24]


def mask_handle(user: str, psp: str) -> str:
    return (user[:2] + "***@" + psp).lower()


def _strip_query(url: str) -> str:
    try:
        p = urlsplit(url if "://" in url else "http://" + url)
    except ValueError:
        return url[:200]
    q = "?[query removed]" if p.query else ""
    shown = (p.scheme + "://" if "://" in url else "") + (p.hostname or "") + (f":{p.port}" if p.port else "") + p.path
    return (shown + q)[:300]


def redact_evidence(text: str, max_len: int = 4000) -> str:
    """Remove secrets and personal identifiers but keep link addresses visible for investigation."""
    # Personal identifiers first, so an e-mail domain is not mistaken for a link.
    text = UPI_HANDLE.sub(_mask_identifier, _EMAIL.sub("[email]", text))
    urls = extract_urls(text, limit=20)
    pieces: list[str] = []
    last = 0
    for raw, start, end in urls:
        pieces.append(_redact_plain(text[last:start]))
        pieces.append(_strip_query(raw))
        last = end
    pieces.append(_redact_plain(text[last:]))
    out = "".join(pieces).strip()
    return out[: max_len - 1] + "…" if len(out) > max_len else out


def _mask_identifier(m: re.Match) -> str:
    """UPI handles are masked (kept recognisable for the user); other e-mail-like strings are removed."""
    if m.group(2).lower() in _UPI_PSP:
        return mask_handle(m.group(1), m.group(2))
    return "[email]"


def _redact_plain(s: str) -> str:
    s = _SECRET_ASSIGN.sub(lambda m: f"{m.group(1)} [secret]", s)
    s = _EMAIL.sub("[email]", s)
    s = _LONG_NUMBER.sub(lambda m: "[number]" + (" " if m.group(0)[-1] in " -" else ""), s)

    def secret(m: re.Match) -> str:
        whole = m.group(0)
        num = m.group(1) or m.group(2)
        return whole.replace(num, "[code]", 1)
    for _ in range(3):  # several codes in one sentence
        s2 = _SECRET_NEAR.sub(secret, s)
        if s2 == s:
            break
        s = s2
    return s


def _path_pattern(path: str) -> str:
    segs = [re.sub(r"\d+", "#", seg.lower()) for seg in path.split("/") if seg][:4]
    return "/" + "/".join(segs) if segs else ""


def extract_indicators(text: str, urls: list[dict], orgs: list[str]) -> dict:
    """Indicators used by Campaign Radar. Only non-official link domains count."""
    official = {d for ds in BRANDS.values() for d in ds}
    domains, links, paths, shorteners = [], [], [], []
    for u in urls:
        dom = (u.get("registered_domain") or "").lower()
        if not dom:
            continue
        if dom in URL_SHORTENERS:
            shorteners.append(_strip_query(u["url"]).lower())
            continue
        if dom in official:
            continue
        domains.append(dom)
        links.append(_strip_query(u["url"]).lower().split("://")[-1])
        try:
            pp = _path_pattern(urlsplit(u["url"] if "://" in u["url"] else "http://" + u["url"]).path)
        except ValueError:
            pp = ""
        if pp and pp != "/":
            paths.append(pp)
    upi_h, upi_m = [], []
    for m in UPI_HANDLE.finditer(text):
        if m.group(2).lower() in _UPI_PSP:
            upi_h.append(keyed_hash(m.group(0)))
            upi_m.append(mask_handle(m.group(1), m.group(2)))
    phones = [keyed_hash(re.sub(r"\D", "", p)[-10:]) for p in _PHONE.findall(text)]
    return {
        "domains": sorted(set(domains)), "links": sorted(set(links)), "path_patterns": sorted(set(paths)),
        "shortened_links": sorted(set(shorteners)), "upi_handles": sorted(set(upi_h)),
        "upi_handles_masked": sorted(set(upi_m)), "phones": sorted(set(phones)), "orgs": sorted(set(orgs)),
    }


def template_text(redacted: str) -> str:
    """Normalised message template for similarity: lower-case, numbers and links collapsed."""
    t = redacted.lower()
    t = re.sub(r"https?://\S+|\b[\w-]+\.(?:com|in|top|xyz|net|org|info|live|site|online|example|test)\S*", " <link> ", t)
    t = re.sub(r"\d+", "#", t)
    t = re.sub(r"[^a-z#<>\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def content_hash(content: str) -> str:
    return hashlib.sha256(" ".join(content.split()).encode()).hexdigest()
