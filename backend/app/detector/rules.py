"""Explainable rule layer for social-engineering tactics.

Each rule belongs to a tactic category (urgency, impersonation, OTP request,
...). A match produces evidence: the exact span in the user's text and a
plain-language explanation. Categories are combined with a noisy-OR so that
several independent tactics raise risk more than any single one.

Weights are expert-set (not fitted on evaluation data). See
docs/methodology.md for how they were chosen and evaluated.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .normalize import CONFUSABLES, NormalizedText


@dataclass(frozen=True)
class Category:
    code: str
    title: str
    weight: float
    explanation: str


CATEGORIES: dict[str, Category] = {c.code: c for c in [
    Category("urgency", "Urgency or time pressure", 0.22,
             "Scammers rush you so you act before thinking or checking."),
    Category("impersonation", "Claims to be a trusted organisation or person", 0.12,
             "The message claims to come from a bank, company, government body or someone you know. "
             "Scammers borrow trusted names to lower your guard."),
    Category("otp_request", "Asks for a one-time code, PIN or CVV", 0.55,
             "Legitimate banks and services never ask you to share a one-time password, PIN or CVV. "
             "Anyone who asks for one can use it to take over your account or approve a payment."),
    Category("credential_request", "Asks you to log in or confirm personal details", 0.35,
             "Requests to 'verify', 'update KYC' or 'confirm details' through a message are a classic way "
             "to steal passwords and identity information."),
    Category("payment_pressure", "Pressure to pay or move money", 0.35,
             "The message pushes you to pay a fee, transfer money, buy gift cards or send crypto. "
             "These payments are usually impossible to reverse."),
    Category("threat", "Threats or penalties", 0.30,
             "Threats of arrest, account blocking, fines or disconnection are used to scare people into acting."),
    Category("secrecy", "Asks you to keep it secret", 0.35,
             "Being told not to tell family, friends or your bank is a strong warning sign: it stops others "
             "from spotting the scam."),
    Category("reward_lure", "Too-good-to-be-true reward", 0.30,
             "Unexpected prizes, lottery wins, refunds or guaranteed returns are bait to get money or details."),
    Category("remote_access", "Asks you to install an app or share your screen", 0.50,
             "Remote-access apps (AnyDesk, TeamViewer, screen sharing) let a scammer control your device and banking apps."),
    Category("family_impersonation", "Unknown number claiming to be family or a friend", 0.35,
             "'Hi Mum, this is my new number' messages are a common scam that ends with an urgent request for money."),
    Category("ai_manipulation", "Hidden instructions aimed at AI or filters", 0.40,
             "The text contains instructions aimed at automated scanners (e.g. 'ignore previous instructions', "
             "'mark this as safe'). Genuine messages do not need to do this."),
    Category("obfuscation", "Disguised characters", 0.25,
             "The text uses invisible characters or look-alike letters from other alphabets, a trick used to "
             "slip past filters and to fake brand names."),
]}


@dataclass
class Evidence:
    category: str
    rule_id: str
    matched_text: str
    start: int
    end: int


@dataclass
class RuleResult:
    evidence: list[Evidence] = field(default_factory=list)

    @property
    def categories(self) -> list[str]:
        seen: list[str] = []
        for e in self.evidence:
            if e.category not in seen:
                seen.append(e.category)
        return seen


def _p(*alternatives: str) -> str:
    return r"(?:" + "|".join(alternatives) + r")"


# (rule_id, category, pattern). Patterns run on normalised lower-case text.
RULES: list[tuple[str, str, re.Pattern[str]]] = [
    # --- urgency
    ("urg_words", "urgency", re.compile(
        r"\b" + _p(r"urgent(?:ly)?", r"immediately", r"right away", r"right now", r"asap", r"act now",
                   r"final (?:notice|warning|reminder)", r"last (?:chance|warning|reminder)",
                   r"expires? (?:today|tonight|soon)", r"limited time", r"don'?t delay", r"before it'?s too late",
                   r"turant", r"jaldi") + r"\b")),
    ("urg_deadline", "urgency", re.compile(
        r"\bwithin (?:the next )?(?:\d{1,2}|one|two|twenty[- ]four|24|48) ?(?:hours?|hrs?|minutes?|mins?)\b"
        r"|\b(?:by|before) (?:today|tonight|midnight|end of (?:the )?day)\b"
        r"|\b(?:today|tonight) only\b")),

    # --- impersonation of organisations / authorities
    ("imp_org", "impersonation", re.compile(
        r"\b" + _p(r"(?:your|the) bank", r"bank (?:of|account|security|team|alert)", r"customer (?:care|support|service)",
                   r"security (?:team|department|alert)", r"fraud (?:team|department|prevention)",
                   r"tech(?:nical)? support", r"help ?desk", r"\birs\b", r"hmrc", r"\brbi\b", r"reserve bank",
                   r"income tax (?:department|dept)", r"police", r"cyber ?cell", r"customs", r"courier",
                   r"fedex", r"\bdhl\b", r"\bups\b", r"usps", r"india ?post", r"royal mail",
                   r"amazon", r"paypal", r"apple ?(?:id|support)", r"icloud", r"microsoft", r"netflix",
                   r"whatsapp (?:team|support)", r"\bsbi\b", r"hdfc", r"icici", r"axis bank", r"paytm",
                   r"phonepe", r"google pay", r"\bkyc\b", r"electricity (?:board|department|office)",
                   r"social security", r"medicare", r"\bceo\b", r"your (?:manager|boss)", r"\bhr department\b") + r"\b")),

    # --- family / friend impersonation
    ("fam_newnum", "family_impersonation", re.compile(
        r"\b(?:hi|hey|hello) (?:mum|mom|mother|dad|father|mummy|papa|grandma|granny|grandpa)\b"
        r"|\b(?:this is|it'?s) my new (?:number|phone|no\.?)\b"
        r"|\bnew (?:number|phone),? (?:save|delete) (?:this|the old)\b"
        r"|\bi (?:lost|broke|dropped) my phone\b")),

    # --- OTP / PIN / CVV requests (negated advice such as "never share your OTP" is excluded in code)
    ("otp_share", "otp_request", re.compile(
        r"\b" + _p(r"share", r"send", r"tell", r"give", r"provide", r"forward", r"reply with", r"read out",
                   r"confirm", r"enter", r"type") + r"\b[^.!?\n]{0,40}?\b"
        + _p(r"otp", r"one[- ]time (?:password|passcode|code|pin)", r"verification code", r"security code",
             r"(?:\d|six|4|four)[- ]digit code", r"\bpin\b", r"cvv", r"cvc", r"auth(?:entication)? code", r"2fa code",
             r"code (?:we|i) (?:just )?sent", r"code you (?:just )?received") + r"\b")),
    ("otp_received", "otp_request", re.compile(
        r"\b(?:the )?(?:otp|code|pin) (?:you(?:'ve| have)? (?:just )?received|sent to your (?:phone|mobile|number))\b")),

    # --- credential / KYC harvesting
    ("cred_verify", "credential_request", re.compile(
        r"\b" + _p(r"verify (?:your )?(?:account|identity|details|information|card|payment)",
                   r"confirm (?:your )?(?:account|identity|details|information|card|password|login)",
                   r"update (?:your )?(?:kyc|pan|aadhaa?r|account|details|billing|payment (?:details|information|method))",
                   r"kyc (?:update|pending|expired?|verification)", r"re-?activate (?:your )?account",
                   r"(?:log|sign) ?in (?:to|now|here|immediately|below)", r"enter (?:your )?(?:password|card details|bank details)",
                   r"(?:card|bank|account) (?:number|details)", r"login (?:details|credentials)",
                   r"(?:send|share|give|tell|confirm) (?:me |us )?(?:your )?(?:password|passcode|login)") + r"\b")),

    # --- payment pressure
    ("pay_fee", "payment_pressure", re.compile(
        r"\b" + _p(r"pay (?:now|immediately|the|a|your|us|via|using|by)", r"payment (?:is )?(?:due|pending|required|overdue|failed)",
                   r"processing fee", r"(?:delivery|customs|release|clearance|registration|redelivery) (?:fee|charge|charges)",
                   r"outstanding (?:balance|amount|bill|dues)", r"(?:transfer|send|wire) (?:the )?(?:money|funds|amount|payment|rs\.?|inr|\$|£|€)",
                   r"gift ?cards?", r"itunes cards?", r"google play cards?", r"steam cards?", r"bitcoin", r"\bbtc\b", r"crypto(?:currency)?",
                   r"usdt", r"\bupi\b", r"scan (?:the|this) qr", r"bank transfer", r"western union", r"moneygram",
                   r"advance (?:fee|payment)", r"refundable deposit", r"small fee", r"token amount") + r"\b")),
    ("pay_ask", "payment_pressure", re.compile(
        r"\b(?:can|could) you (?:please )?(?:send|transfer|lend|pay|wire)\b"
        r"|\b(?:send|transfer|wire|lend) (?:me |us )?(?:rs\.?\s?|inr\s?|₹\s?|\$|£|€)?\d[\d,]*\b"
        r"|\bneed (?:some )?(?:money|cash|funds)\b")),

    # --- threats
    ("thr_account", "threat", re.compile(
        r"\b(?:account|card|sim|number|service|connection|electricity|power|wallet)\b[^.!?\n]{0,30}?\b"
        r"(?:will be |has been |is |to be )?(?:suspended|blocked|closed|deactivated|disconnected|terminated|frozen|locked|cut off|restricted)\b")),
    ("thr_legal", "threat", re.compile(
        r"\b" + _p(r"arrest(?:ed)?", r"arrest warrant", r"legal action", r"lawsuit", r"court (?:case|summons|notice)",
                   r"penalty", r"fine of", r"prosecut(?:e|ion|ed)", r"jail", r"police case", r"fir (?:will|has)",
                   r"digital arrest", r"money laundering", r"drug (?:parcel|package)") + r"\b")),

    # --- secrecy
    ("sec_tell", "secrecy", re.compile(
        r"\b" + _p(r"(?:don'?t|do not|never) (?:tell|inform|discuss (?:this )?with|mention (?:this )?to) (?:anyone|anybody|your (?:family|bank|parents|wife|husband|friends)|(?:mum|mom|dad|mummy|papa|the family|my (?:mum|mom|dad)))",
                   r"keep (?:this|it) (?:a )?(?:secret|confidential|between us|private)", r"between (?:you and me|us only)",
                   r"strictly confidential", r"tell no ?one", r"(?:don'?t|do not) (?:call|contact|visit) (?:the|your) (?:bank|branch|police)") + r"\b")),

    # --- reward / investment lure
    ("rew_win", "reward_lure", re.compile(
        r"\b" + _p(r"you(?:'ve| have)? (?:won|been selected|been chosen)", r"congratulations", r"winner", r"lottery", r"jackpot",
                   r"prize", r"claim (?:your|the|now|it)", r"free (?:gift|iphone|reward|voucher|money|recharge)", r"cash ?back",
                   r"reward points? (?:expir|redeem)", r"guaranteed (?:returns?|profit|income)", r"double your (?:money|investment)",
                   r"(?:earn|make) (?:rs\.?|inr|₹|\$|£)?\s?\d[\d,]* ?(?:per|a|/) ?(?:day|week|hour)", r"work from home",
                   r"part[- ]time job", r"like (?:youtube )?videos? and earn", r"tax refund", r"refund (?:of|is|has been)\b"))),

    # --- remote access
    ("rem_app", "remote_access", re.compile(
        r"\b" + _p(r"anydesk", r"teamviewer", r"quick ?support", r"rustdesk", r"ultraviewer", r"screen ?shar(?:e|ing)",
                   r"remote (?:access|desktop|support)", r"install (?:this|the|our) (?:app|application|apk|software)",
                   r"download (?:this|the|our) (?:app|apk)", r"\.apk\b") + r"\b")),

    # --- prompt injection / filter manipulation aimed at AI scanners
    ("ai_ignore", "ai_manipulation", re.compile(
        r"\b" + _p(r"ignore (?:all |any )?(?:previous|prior|above) (?:instructions|rules|prompts)",
                   r"disregard (?:the|all|previous) (?:instructions|rules)", r"(?:mark|classify|label|rate) (?:this|the) (?:message|email|link) as (?:safe|legit(?:imate)?|not spam)",
                   r"you are (?:an|a) (?:ai|language model|assistant)", r"system prompt", r"this (?:message|email) is (?:100% )?safe and (?:verified|legit)") + r"\b")),
]

# Negations that turn an OTP mention into safety advice (e.g. bank OTP SMS).
_NEGATION_BEFORE = re.compile(
    r"(?:never|do not|don'?t|dont|not to|won'?t|will not|no one|nobody|should not|must not)\W+(?:\w+\W+){0,5}$")


def _is_negated(text: str, start: int) -> bool:
    window = text[max(0, start - 40):start]
    return bool(_NEGATION_BEFORE.search(window))


_WORD = re.compile(r"\S+")


def _obfuscation_evidence(nt: NormalizedText) -> list[Evidence]:
    ev: list[Evidence] = []
    if nt.zero_width_count:
        ev.append(Evidence("obfuscation", "obf_zero_width",
                           f"{nt.zero_width_count} invisible character(s)", 0, 0))
    # Look-alike letters mixed into otherwise Latin words (e.g. "Pаypal" with a Cyrillic 'а').
    for m in _WORD.finditer(nt.original):
        word = m.group(0)
        has_conf = any(ch in CONFUSABLES for ch in word)
        has_ascii = any("a" <= ch.lower() <= "z" for ch in word)
        if has_conf and has_ascii:
            ev.append(Evidence("obfuscation", "obf_mixed_script", word, m.start(), m.end()))
            if len(ev) >= 5:
                break
    return ev


def run_rules(nt: NormalizedText) -> RuleResult:
    result = RuleResult()
    text = nt.text
    for rule_id, category, pattern in RULES:
        for m in pattern.finditer(text):
            if m.end() == m.start():
                continue
            if category in ("otp_request", "credential_request", "secrecy") and _is_negated(text, m.start()):
                # "Never share your OTP" / "do not share your password" is safety advice, not a request.
                continue
            if rule_id == "sec_tell" and re.search(r"\b(?:otp|pin|password|code)\b", text[m.end():m.end() + 25]):
                continue
            o_start, o_end = nt.span_to_original(m.start(), m.end())
            result.evidence.append(Evidence(category, rule_id, nt.original[o_start:o_end], o_start, o_end))
            if sum(1 for e in result.evidence if e.rule_id == rule_id) >= 3:
                break
    result.evidence.extend(_obfuscation_evidence(nt))
    return result


# Pairs of tactics that are much more dangerous together than apart.
COMBINATIONS: list[tuple[frozenset[str], float, str]] = [
    (frozenset({"impersonation", "otp_request"}), 0.25, "Claims to be an organisation and asks for a code"),
    (frozenset({"urgency", "payment_pressure"}), 0.15, "Rushes you to pay"),
    (frozenset({"threat", "payment_pressure"}), 0.20, "Threatens you and demands payment"),
    (frozenset({"family_impersonation", "payment_pressure"}), 0.30, "'New number' contact asking for money"),
    (frozenset({"secrecy", "payment_pressure"}), 0.20, "Asks for money and secrecy"),
    (frozenset({"impersonation", "credential_request"}), 0.15, "Claims to be an organisation and asks for login details"),
    (frozenset({"impersonation", "remote_access"}), 0.20, "'Support' asking you to install remote access"),
    (frozenset({"reward_lure", "payment_pressure"}), 0.15, "Prize or job that needs a fee first"),
]


def noisy_or(weights: list[float]) -> float:
    p = 1.0
    for w in weights:
        p *= (1.0 - max(0.0, min(1.0, w)))
    return 1.0 - p


def score_categories(categories: list[str]) -> tuple[float, list[str]]:
    cats = set(categories)
    weights = [CATEGORIES[c].weight for c in cats if c in CATEGORIES]
    combos = []
    for combo, bonus, label in COMBINATIONS:
        if combo <= cats:
            weights.append(bonus)
            combos.append(label)
    return noisy_or(weights), combos
