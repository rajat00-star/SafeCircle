"""Static URL risk analysis.

The analyser never fetches the URL. Fetching attacker-controlled links from a
server invites SSRF, tips off the attacker that the link was opened, and can
expose the server to drive-by content. All signals come from the URL string.
"""
from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass, field
from urllib.parse import parse_qsl, unquote, urlsplit

import tldextract

from .ml import load_url_model
from .normalize import normalize

# Chosen on a development validation split (see docs/methodology.md), not on test data.
HOST_MODEL_WEIGHT = 0.4
HOST_MODEL_GATE = 0.8

# Offline public-suffix list (bundled snapshot); never fetch at runtime.
_EXTRACT = tldextract.TLDExtract(suffix_list_urls=(), cache_dir=None)

# Brand -> registered domains that the brand legitimately uses.
BRANDS: dict[str, set[str]] = {
    "paypal": {"paypal.com", "paypal.me", "paypalobjects.com"},
    "amazon": {"amazon.com", "amazon.in", "amazon.co.uk", "amazon.de", "amazon.ca", "amazon.com.au", "amazon.fr",
               "amazon.co.jp", "amazon.es", "amazon.it", "amazonaws.com", "amazon.dev", "a2z.com", "aws.amazon.com",
               "amazonvideo.com", "media-amazon.com", "amazonses.com", "primevideo.com", "amazontrust.com"},
    "apple": {"apple.com", "icloud.com", "apple.co", "apple-dns.net", "apple-cloudkit.com", "mzstatic.com", "icloud-content.com"},
    "icloud": {"icloud.com", "apple.com", "icloud-content.com", "apple-cloudkit.com"},
    "microsoft": {"microsoft.com", "live.com", "office.com", "microsoftonline.com", "outlook.com", "office365.com",
                  "msn.com", "azure.com", "windows.net", "sharepoint.com", "bing.com", "azure.net", "onmicrosoft.com",
                  "microsoft365.com", "cloud.microsoft", "msftauth.net", "msauth.net", "office.net"},
    "office365": {"office.com", "microsoft.com", "office365.com", "microsoftonline.com"},
    "outlook": {"outlook.com", "live.com", "office.com", "microsoft.com"},
    "google": {"google.com", "gmail.com", "youtube.com", "google.co.in", "google.co.uk", "googleapis.com", "gstatic.com",
               "goo.gl", "g.co", "googleusercontent.com", "blogger.com", "googlevideo.com", "googlesyndication.com",
               "googletagmanager.com", "google-analytics.com", "googleadservices.com", "doubleclick.net", "ggpht.com"},
    "gmail": {"gmail.com", "google.com"},
    "netflix": {"netflix.com", "nflxext.com", "nflximg.net"},
    "facebook": {"facebook.com", "fb.com", "fb.me", "meta.com", "fbcdn.net"},
    "instagram": {"instagram.com", "cdninstagram.com", "fbcdn.net"},
    "whatsapp": {"whatsapp.com", "whatsapp.net", "wa.me"},
    "linkedin": {"linkedin.com", "lnkd.in", "licdn.com"},
    "dropbox": {"dropbox.com", "db.tt", "dropboxusercontent.com"},
    "docusign": {"docusign.com", "docusign.net"},
    "adobe": {"adobe.com", "adobelogin.com", "adobe.io", "adobedc.net", "adobecontent.io", "adobess.com", "typekit.net"},
    "yahoo": {"yahoo.com", "yahoo.co.in", "yimg.com"},
    "coinbase": {"coinbase.com"},
    "binance": {"binance.com"},
    "metamask": {"metamask.io"},
    "chase": {"chase.com", "jpmorganchase.com", "jpmchase.com", "gslbjpmchase.com"},
    "wellsfargo": {"wellsfargo.com", "wf.com"},
    "bankofamerica": {"bankofamerica.com", "bofa.com"},
    "citibank": {"citi.com", "citibank.com", "citibank.co.in"},
    "hsbc": {"hsbc.com", "hsbc.co.in", "hsbc.co.uk"},
    "sbi": {"sbi.co.in", "onlinesbi.sbi", "sbi", "onlinesbi.com", "sbicard.com"},
    "onlinesbi": {"onlinesbi.sbi", "onlinesbi.com", "sbi.co.in"},
    "hdfc": {"hdfcbank.com", "hdfc.com", "hdfcbank.net", "hdfclife.com"},
    "icici": {"icicibank.com", "icici.bank.in", "icicidirect.com"},
    "axisbank": {"axisbank.com"},
    "kotak": {"kotak.com"},
    "paytm": {"paytm.com", "paytm.in", "paytmbank.com"},
    "phonepe": {"phonepe.com"},
    "dhl": {"dhl.com", "dhl.de", "dhl.co.uk", "dhl.co.in"},
    "fedex": {"fedex.com"},
    "usps": {"usps.com"},
    "royalmail": {"royalmail.com"},
    "indiapost": {"indiapost.gov.in"},
    "irs": {"irs.gov"},
    "hmrc": {"gov.uk"},
    "steam": {"steampowered.com", "steamcommunity.com", "steamstatic.com"},
    "spotify": {"spotify.com"},
    "ebay": {"ebay.com", "ebay.co.uk", "ebay.in"},
    "walmart": {"walmart.com"},
    "flipkart": {"flipkart.com"},
    "airtel": {"airtel.in", "airtel.com"},
    "jio": {"jio.com"},
    "att": {"att.com"},
    "verizon": {"verizon.com", "verizon.net", "verizonwireless.com"},
}

# Shared CDN / DNS infrastructure: hostnames under these embed customer names by design.
INFRASTRUCTURE = {
    "akamaized.net", "akadns.net", "edgekey.net", "akamaiedge.net", "edgesuite.net", "akamaihd.net", "fastly.net",
    "cloudfront.net", "azureedge.net", "trafficmanager.net", "demdex.net", "omtrdc.net", "cdn.cloudflare.net",
    "edgecastcdn.net", "llnwd.net", "impervadns.net", "cloudflare.net",
}

# Ordinary words that are one edit from a brand name.
TYPO_STOPWORDS = {"cloud", "email", "emails", "stream", "streams", "finance", "apples", "applet", "pineapple", "chaser",
                  "chased", "steams", "steamy", "steamer", "google", "giggle", "goggle", "goggles", "paypa", "netflx",
                  "visas", "hsbcs", "fedx", "binary", "linked", "drops"}

URL_SHORTENERS = {
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rb.gy", "ow.ly", "shorturl.at", "tiny.cc",
    "buff.ly", "rebrand.ly", "t.ly", "bl.ink", "s.id", "v.gd", "shorte.st", "adf.ly", "lnkd.in", "qrco.de", "urlz.fr",
    "tinyurl.is", "short.gy", "u.to", "clck.ru",
}

# TLDs that are cheap/free and heavily abused. A hint, not a verdict.
SUSPICIOUS_TLDS = {
    "zip", "mov", "xyz", "top", "tk", "ml", "ga", "cf", "gq", "icu", "click", "link", "rest", "cam", "sbs",
    "buzz", "monster", "cyou", "cfd", "bond", "quest", "support", "live", "online", "site", "store", "shop",
    "info", "work", "fit", "loan", "win", "bid", "vip", "lol", "pw", "ru.com", "su",
}

# Free hosting / builders where anyone can publish a page under a shared domain.
FREE_HOSTING = {
    "000webhostapp.com", "weebly.com", "wixsite.com", "firebaseapp.com", "web.app", "pages.dev", "netlify.app",
    "vercel.app", "glitch.me", "repl.co", "replit.app", "ngrok.io", "ngrok-free.app", "github.io", "gitlab.io",
    "blogspot.com", "sites.google.com", "webflow.io", "square.site", "godaddysites.com", "mystrikingly.com",
    "duckdns.org", "herokuapp.com", "onrender.com", "workers.dev", "r2.dev", "ipfs.io", "dweb.link",
    "azurewebsites.net", "appspot.com", "wordpress.com", "jimdosite.com", "yolasite.com", "ewp.live", "framer.app",
}

SENSITIVE_PATH_WORDS = re.compile(
    r"(?:login|log-in|signin|sign-in|logon|verify|verification|validate|account|secure|update|unlock|"
    r"confirm|wallet|kyc|otp|banking|webscr|password|passwd|credential|suspend|billing|recover|authenticate|auth)",
    re.I,
)

RISKY_EXTENSIONS = re.compile(r"\.(?:apk|exe|scr|msi|bat|cmd|js|vbs|jar|dmg|pkg|iso|hta|lnk|ps1)$", re.I)

DIGIT_FOLD = str.maketrans({"0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s"})


@dataclass(frozen=True)
class UrlSignal:
    code: str
    title: str
    weight: float
    detail: str


@dataclass
class UrlAnalysis:
    url: str
    normalized_url: str
    hostname: str
    registered_domain: str
    signals: list[UrlSignal] = field(default_factory=list)
    valid: bool = True

    @property
    def score(self) -> float:
        p = 1.0
        for s in self.signals:
            p *= 1.0 - s.weight
        return 1.0 - p


def _levenshtein(a: str, b: str, limit: int = 2) -> int:
    if abs(len(a) - len(b)) > limit:
        return limit + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        if min(cur) > limit:
            return limit + 1
        prev = cur
    return prev[-1]


def _ensure_scheme(url: str) -> str:
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", url) and not re.match(r"^[^/:]+:\d+", url):
        return url
    return "http://" + url


def analyze_url(raw: str, use_model: bool = True) -> UrlAnalysis:
    raw = raw.strip()
    nt = normalize(raw)
    lowered = raw.lower()
    signals: list[UrlSignal] = []

    if lowered.startswith(("javascript:", "data:", "vbscript:")):
        return UrlAnalysis(raw, raw, "", "", [UrlSignal("dangerous_scheme", "Script or data link", 0.9,
                                                        "This link runs code or embeds content directly instead of opening a website.")])

    candidate = _ensure_scheme(raw)
    try:
        parts = urlsplit(candidate)
        host = (parts.hostname or "").rstrip(".")
        port = parts.port
    except ValueError:
        return UrlAnalysis(raw, raw, "", "", [UrlSignal("malformed", "Malformed link", 0.4,
                                                        "The link is malformed, which is unusual for genuine services.")],
                           valid=False)

    if not host:
        return UrlAnalysis(raw, raw, "", "", [], valid=False)

    path_q = unquote(parts.path + ("?" + parts.query if parts.query else ""))
    ext = _EXTRACT(host)
    registered = ext.top_domain_under_public_suffix or host
    suffix = ext.suffix
    sub_labels = [s for s in ext.subdomain.split(".") if s] if ext.subdomain else []

    def add(code: str, title: str, weight: float, detail: str) -> None:
        signals.append(UrlSignal(code, title, weight, detail))

    # Host is a raw IP address.
    is_ip = False
    try:
        ipaddress.ip_address(host.strip("[]"))
        is_ip = True
    except ValueError:
        pass
    if is_ip:
        add("ip_host", "Uses a raw IP address", 0.45,
            f"The link points to the number {host} instead of a named website. Real companies use their domain name.")

    if "@" in (parts.netloc or ""):
        add("userinfo_trick", "Hidden destination with '@'", 0.5,
            "Everything before '@' in a link is ignored by the browser, a trick to make a link look like a different site.")

    if host.startswith("xn--") or ".xn--" in host:
        add("punycode", "Internationalised look-alike domain", 0.45,
            "The domain uses encoded non-Latin characters (punycode), which can imitate well-known brands.")
    if nt.confusable_count or nt.zero_width_count:
        add("confusable_chars", "Look-alike or invisible characters", 0.5,
            "The link contains letters from other alphabets or invisible characters that imitate normal letters.")

    if registered in URL_SHORTENERS or host in URL_SHORTENERS:
        add("shortener", "Shortened link hides the destination", 0.3,
            f"{host} is a link shortener; you cannot see where it really goes before opening it.")

    hosting = next((h for h in FREE_HOSTING if host == h or host.endswith("." + h)), None)
    if hosting:
        add("free_hosting", "Hosted on a free website builder", 0.25,
            f"The page is on {hosting}, where anyone can publish a site in minutes. Phishing kits often use these.")

    if not is_ip and (suffix in SUSPICIOUS_TLDS or suffix.split(".")[-1] in SUSPICIOUS_TLDS):
        add("suspicious_tld", "Frequently abused domain ending", 0.2,
            f"The '.{suffix}' ending is cheap and commonly abused. Many legitimate sites use it too, so this is only a hint.")

    if not is_ip and len(sub_labels) >= 4:
        add("deep_subdomains", "Unusually many subdomains", 0.1,
            f"The address has {len(sub_labels)} levels before the real domain ({registered}), a way to bury the real domain.")

    domain_label = ext.domain.lower()
    if domain_label.removeprefix("xn--").count("-") >= 2:
        add("hyphenated_domain", "Domain stuffed with hyphens", 0.2,
            f"'{registered}' uses several hyphens, typical of throwaway look-alike domains (e.g. secure-login-bank).")
    if sum(c.isdigit() for c in domain_label) >= 4 and not is_ip:
        add("digit_heavy_domain", "Random-looking domain", 0.15, f"'{registered}' contains many digits.")

    if port and port not in (80, 443):
        add("unusual_port", "Unusual network port", 0.25, f"The link uses port {port}, which normal websites rarely do.")

    if parts.scheme == "http" and raw.lower().startswith("http://"):
        add("no_https", "Not encrypted (http)", 0.1,
            "The link uses plain http. Login and payment pages must use https; https alone does not make a site safe.")

    if len(raw) > 120:
        add("long_url", "Very long link", 0.1, f"The link is {len(raw)} characters long, which can hide the real destination.")

    # Brand impersonation: brand name appears in subdomain/path/domain but the registered domain isn't the brand's.
    host_tokens = re.split(r"[.\-_]", host.lower())
    path_l = path_q.lower()
    is_official = any(registered in official for official in BRANDS.values())
    is_infra = registered in INFRASTRUCTURE
    for brand, official in BRANDS.items():
        if is_official or is_infra or host in official or any(host.endswith("." + o) for o in official):
            break
        # Short brand names (sbi, att, jio) only count as whole tokens to avoid matching "battery" etc.
        # Longer ones also count when glued to another word at the start or end ("paypalsecure", "myamazon").
        in_host = brand in host_tokens or (
            len(brand) >= 5 and any(t != brand and (t.startswith(brand) or t.endswith(brand)) and len(t) <= len(brand) + 10
                                    for t in host_tokens))
        in_path = len(brand) >= 4 and re.search(r"(?<![a-z])" + re.escape(brand) + r"(?![a-z])", path_l)
        if in_host:
            add("brand_in_host", f"Uses the name '{brand}' on a domain it doesn't own", 0.55,
                f"The address mentions {brand}, but the real domain is {registered}, which is not an official {brand} domain.")
            break
        if in_path and SENSITIVE_PATH_WORDS.search(path_l):
            add("brand_in_path", f"Mentions '{brand}' on an unrelated site", 0.35,
                f"The link path mentions {brand} next to login/verify words, but the site is {registered}.")
            break

    # Typosquatting: a host label one edit away from a brand (paypa1, arnazon, micros0ft).
    if not any(s.code == "brand_in_host" for s in signals) and not is_ip and not is_official and not is_infra:
        labels = {domain_label, *host_tokens}
        hit = None
        for label in labels:
            if len(label) < 5 or label in TYPO_STOPWORDS:
                continue
            folded = label.translate(DIGIT_FOLD).replace("rn", "m").replace("vv", "w")
            for brand in BRANDS:
                if len(brand) < 5 or label == brand:
                    continue
                # Same length (substitution) or one extra character; deletions match too many real words.
                if folded == brand or (len(folded) >= len(brand) and _levenshtein(folded, brand, 1) == 1):
                    hit = brand
                    break
            if hit:
                break
        if hit:
            add("typosquat", f"Look-alike of '{hit}'", 0.6,
                f"'{registered}' looks like {hit} but is spelled differently. This is called typosquatting.")

    if SENSITIVE_PATH_WORDS.search(path_l) and not is_official and not any(s.code.startswith("brand") for s in signals):
        add("sensitive_path", "Asks for login or verification", 0.15,
            "The link path contains words like login, verify or account, often used on credential-phishing pages.")

    if RISKY_EXTENSIONS.search(parts.path or ""):
        add("risky_download", "Downloads an app or program", 0.5,
            "The link downloads an app or program file. Installing apps from messages can give scammers control of your phone or computer.")

    for _k, v in parse_qsl(parts.query or ""):
        if re.match(r"^(?:https?:)?//", v) or re.match(r"^https?%3a", v, re.I):
            add("embedded_redirect", "Redirects to another site", 0.2,
                "The link contains another web address inside it, which can bounce you to a different site.")
            break

    if not is_ip and use_model and not is_official and not is_infra:
        model = load_url_model()
        if model is not None:
            prob = model.probability(host)
            if prob >= HOST_MODEL_GATE:
                add("host_model", "Domain resembles known phishing domains", round(HOST_MODEL_WEIGHT * prob, 3),
                    f"A model trained on thousands of reported phishing domains rates this domain name as similar "
                    f"to them ({round(prob * 100)}% similarity score). This is a statistical hint, not proof.")

    return UrlAnalysis(raw, candidate, host, registered, signals)


# Find URLs in free text. Includes bare domains like "secure-pay.top/login".
URL_IN_TEXT = re.compile(
    r"""(?xi)
    \b(
      (?:https?://|hxxps?://|www\.)[^\s<>"'`]+
      |
      (?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|in|co|io|me|info|xyz|top|tk|ml|ga|cf|gq|icu|click|link|
         live|online|site|store|shop|app|dev|ly|gl|gd|at|cc|uk|us|ru|cn|vip|win|loan|support|sbs|cfd|bond|buzz|cyou|rest|cam|zip|mov|ai|gov|sbi|bank)
      (?::\d{2,5})?(?:/[^\s<>"'`]*)?
    )
    """
)


def extract_urls(text: str, limit: int = 10) -> list[tuple[str, int, int]]:
    found: list[tuple[str, int, int]] = []
    for m in URL_IN_TEXT.finditer(text):
        url = m.group(1).rstrip(".,);:!?'\"]")
        url = re.sub(r"^hxxp", "http", url, flags=re.I)
        if re.fullmatch(r"[\d.]+", url):
            continue
        found.append((url, m.start(1), m.start(1) + len(m.group(1).rstrip(".,);:!?'\"]"))))
        if len(found) >= limit:
            break
    return found
