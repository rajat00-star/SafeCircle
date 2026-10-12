"""Case-level assessment: attack-chain reconstruction, risk, uncertainty and change explanation.

Pure functions over stored event records (dicts), so a case can be re-evaluated
without the original text. Nothing here reads the database or the network.

Vocabulary used throughout:
  observed  - directly supported by text or a link in submitted evidence
  inferred  - a relationship the engine proposes (e.g. stage progression), not confirmed
  risk score - a heuristic 0-100 indicator from expert-set weights; NOT a probability of fraud
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from .evidence import template_text
from .tactics import CHAIN_STAGES, STAGES, TACTICS, EventDetection, official_domains

SCORE_LABEL = "Heuristic risk indicator from transparent rules. It is not a calibrated probability of fraud."

# Pairs of tactics that are more dangerous together, possibly spread over several events.
CASE_COMBINATIONS: list[tuple[frozenset[str], float, str]] = [
    (frozenset({"authority_impersonation", "secret_request"}), 0.20, "A claimed bank or authority asks for a secret code"),
    (frozenset({"kyc_suspension", "credential_link"}), 0.15, "A KYC or suspension threat leads to a login link"),
    (frozenset({"digital_arrest", "payment_diversion"}), 0.25, "Coercive authority demands a transfer"),
    (frozenset({"digital_arrest", "payment_pressure"}), 0.20, "Coercive authority demands payment"),
    (frozenset({"remote_access", "secret_request"}), 0.20, "Device control combined with a request for codes"),
    (frozenset({"remote_access", "upi_collect"}), 0.20, "Device control combined with a UPI request"),
    (frozenset({"reward_lure", "upi_collect"}), 0.20, "Promised money used to trigger a UPI collect request"),
    (frozenset({"family_impersonation", "payment_diversion"}), 0.25, "'New number' contact asks for a transfer"),
    (frozenset({"family_impersonation", "payment_pressure"}), 0.20, "'New number' contact asks for money"),
]
STAGE_BONUS = {3: 0.15, 4: 0.25, 5: 0.30}
TEMPLATE_REPEAT_THRESHOLD = 0.8

RECOMMENDATION_PRIORITY = ["secret_request", "upi_collect", "remote_access", "payment_diversion", "digital_arrest",
                           "credential_link", "kyc_suspension", "payment_pressure", "family_impersonation",
                           "suspicious_link", "credential_request", "authority_impersonation", "threat", "secrecy",
                           "reward_lure", "repeated_indicator", "obfuscation", "ai_manipulation", "urgency"]
REPORTING = "Report it at cybercrime.gov.in or call 1930 (India's national cyber-crime helpline). If money moved, call your bank first."


@dataclass(frozen=True)
class Thresholds:
    medium: int = 30
    high: int = 60
    near: int = 5           # within this many points of a threshold counts as "close"
    model_review: float = 0.85


def noisy_or(weights: list[float]) -> float:
    p = 1.0
    for w in weights:
        p *= 1.0 - max(0.0, min(1.0, w))
    return 1.0 - p


def level_for(score: int, t: Thresholds) -> str:
    return "high" if score >= t.high else "medium" if score >= t.medium else "low"


# ---------- per-event serialisation ----------

def serialize_detection(det: EventDetection, redact, data_quality: dict, indicators: dict) -> dict:
    """What is stored for one event: tactics with redacted evidence, link summaries, quality and indicators."""
    tactics = []
    for code, hit in det.tactics.items():
        t = TACTICS[code]
        tactics.append({
            "code": code, "title": t.title, "stage": t.stage, "severity": hit.severity, "basis": hit.basis,
            "evidence": [{"text": redact(e["text"])[:200], "rule": e["rule"]} for e in hit.evidence],
        })
    tactics.sort(key=lambda x: -x["severity"])
    return {
        "tactics": tactics,
        "event_score": round(det.score * 100),
        "urls": [{"url": redact(u["url"])[:300], "registered_domain": u["registered_domain"], "risk_score": u["risk_score"],
                  "signals": [{"code": s["code"], "title": s["title"], "detail": s["detail"]} for s in u["signals"]]}
                 for u in det.urls],
        "ml_probability": det.ml_probability,
        "safety_advice": det.safety_advice,
        "mitigation": det.mitigation,
        "claimed_orgs": det.claimed_orgs,
        "data_quality": data_quality,
        "indicators": indicators,
    }


def event_data_quality(kind: str, text_length: int, ocr_confidence: float | None = None) -> dict:
    notes = []
    level = "good"
    if kind == "url":
        level, notes = "limited", ["Only a link address: message wording was not available."]
    elif kind == "screenshot":
        if ocr_confidence is None:
            level, notes = "poor", ["No text could be read from the screenshot."]
        elif ocr_confidence < 45:
            level, notes = "poor", [f"Screenshot text was hard to read (OCR confidence {ocr_confidence:.0f}/100)."]
        elif ocr_confidence < 70:
            level, notes = "limited", [f"Some screenshot text may be misread (OCR confidence {ocr_confidence:.0f}/100)."]
    if kind != "url" and text_length < 25 and level == "good":
        level, notes = "limited", ["Very short text: few words to judge from."]
    return {"level": level, "notes": notes, "ocr_confidence": ocr_confidence}


# ---------- ordering ----------

def order_events(events: list[dict]) -> tuple[list[dict], dict]:
    timed = [e for e in events if e.get("observed_at")]
    by_seq = sorted(events, key=lambda e: e["seq"])
    if not events:
        return [], {"basis": "none", "known": False, "note": "No evidence yet."}
    if len(timed) == len(events):
        ordered = sorted(events, key=lambda e: (e["observed_at"], e["seq"]))
        moved = [e["seq"] for e in ordered] != [e["seq"] for e in by_seq]
        note = "Ordered by the time you reported for each piece of evidence."
        if moved:
            note += " This differs from the order the evidence was added."
        return ordered, {"basis": "reported_time", "known": True, "note": note}
    if not timed:
        return by_seq, {"basis": "submission_order", "known": False,
                        "note": "Shown in the order evidence was added, which may differ from when it was received. "
                                "Add the time each message arrived to confirm the sequence."}
    ordered = sorted(timed, key=lambda e: (e["observed_at"], e["seq"])) + [e for e in by_seq if not e.get("observed_at")]
    return ordered, {"basis": "mixed", "known": False,
                     "note": "Events with a reported time come first in time order; the rest follow in the order they were added."}


# ---------- assessment ----------

def _similarity(a: str, b: str) -> float:
    def sh(t: str) -> set[str]:
        w = t.split()
        return {" ".join(w[i:i + 3]) for i in range(max(1, len(w) - 2))} if w else set()
    sa, sb = sh(a), sh(b)
    return len(sa & sb) / len(sa | sb) if sa and sb else 0.0


def _repeated_indicators(ordered: list[dict]) -> list[dict]:
    """Indicators that appear in more than one event of the same case."""
    seen: dict[tuple[str, str], list[dict]] = {}
    for e in ordered:
        ind = e["detection"].get("indicators", {})
        for kind in ("domains", "upi_handles", "phones", "path_patterns"):
            for v in ind.get(kind, []):
                seen.setdefault((kind, v), []).append(e)
    out = []
    labels = {"domains": "domain", "upi_handles": "UPI handle", "phones": "phone number", "path_patterns": "link path"}
    for (kind, v), evs in seen.items():
        if len({x["id"] for x in evs}) < 2:
            continue
        shown = v
        if kind == "upi_handles":
            shown = next(iter(evs[0]["detection"]["indicators"].get("upi_handles_masked", [])), "a UPI handle")
        if kind == "phones":
            shown = "the same phone number (stored only as a hash)"
        out.append({"text": f"Same {labels[kind]} {shown} in events " + ", ".join(f"#{x['seq']}" for x in evs),
                    "events": [x["id"] for x in evs]})
    texts = [(e, template_text(e.get("excerpt") or "")) for e in ordered if e["kind"] != "url"]
    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            if len(texts[i][1].split()) >= 6 and _similarity(texts[i][1], texts[j][1]) >= TEMPLATE_REPEAT_THRESHOLD:
                out.append({"text": f"Events #{texts[i][0]['seq']} and #{texts[j][0]['seq']} use nearly the same wording",
                            "events": [texts[i][0]["id"], texts[j][0]["id"]]})
    return out[:6]


def assess_case(events: list[dict], t: Thresholds = Thresholds()) -> dict:
    """events: [{id, seq, kind, channel, observed_at (ISO str|None), excerpt, detection}]"""
    ordered, order = order_events(events)
    position = {e["id"]: i + 1 for i, e in enumerate(ordered)}

    # Aggregate tactics across events; keep where each was first seen.
    agg: dict[str, dict] = {}
    for e in ordered:
        for tac in e["detection"]["tactics"]:
            a = agg.setdefault(tac["code"], {
                "code": tac["code"], "title": tac["title"], "stage": tac["stage"], "severity": 0.0,
                "first_event": e["id"], "first_position": position[e["id"]], "events": [], "evidence": [],
                "basis": "observed", "source": tac.get("basis", "text_match"),
            })
            a["severity"] = max(a["severity"], tac["severity"])
            if e["id"] not in a["events"]:
                a["events"].append(e["id"])
            for ev in tac["evidence"][:2]:
                if len(a["evidence"]) < 4:
                    a["evidence"].append({"event_id": e["id"], "seq": e["seq"], "text": ev["text"]})

    repeats = _repeated_indicators(ordered)
    if repeats:
        rt = TACTICS["repeated_indicator"]
        agg["repeated_indicator"] = {
            "code": rt.code, "title": rt.title, "stage": rt.stage, "severity": rt.severity,
            "first_event": repeats[0]["events"][-1], "first_position": max(position[x] for x in repeats[0]["events"]),
            "events": sorted({x for r in repeats for x in r["events"]}, key=lambda x: position[x]),
            "evidence": [{"event_id": r["events"][-1], "seq": None, "text": r["text"]} for r in repeats[:4]],
            "basis": "inferred", "source": "cross_event",
        }

    components = [{"label": a["title"], "weight": round(a["severity"], 3), "kind": "tactic"} for a in agg.values()]
    mitigations = [f"Evidence #{e['seq']}: {e['detection']['mitigation']}" for e in ordered if e["detection"].get("mitigation")]
    codes = set(agg)
    for combo, bonus, label in CASE_COMBINATIONS:
        if combo <= codes:
            components.append({"label": label, "weight": bonus, "kind": "combination"})
    stages = [s for s in CHAIN_STAGES if any(a["stage"] == s for a in agg.values())]
    bonus = max((b for n, b in STAGE_BONUS.items() if len(stages) >= n), default=0.0)
    if bonus:
        components.append({"label": f"Attack spans {len(stages)} stages ({', '.join(STAGES[s].title for s in stages)})",
                           "weight": bonus, "kind": "stage_bonus"})
    score = int(round(noisy_or([c["weight"] for c in components]) * 100))
    level = level_for(score, t)

    conflicts = _conflicts(ordered)
    missing = _missing(ordered, agg, stages, order)

    # Model signal is reported separately: it never changes the score.
    probs = [e["detection"].get("ml_probability") for e in ordered if e["detection"].get("ml_probability") is not None]
    model = None
    if probs:
        mx = max(probs)
        model = {"max_probability": round(mx, 3),
                 "note": "Similarity of the wording to a public SMS spam dataset. Uncalibrated and not used in the score."}

    # Uncertainty and review.
    reasons = []
    if conflicts:
        reasons.append("Some evidence points in different directions (see conflicts).")
    if any(abs(score - th) <= t.near for th in (t.medium, t.high)) and score > 0:
        reasons.append("The score is close to a risk threshold.")
    if ordered and all(e["kind"] == "url" for e in ordered) and agg:
        reasons.append("Only link addresses were checked; there is no message wording.")
    if len(agg) == 1 and level != "low":
        reasons.append("The assessment rests on a single tactic.")
    poor = [e for e in ordered if e["detection"].get("data_quality", {}).get("level") == "poor"]
    if poor:
        reasons.append("Some evidence was hard to read, so tactics may have been missed.")
    advice = any(e["detection"].get("safety_advice") for e in ordered)
    model_only = not agg and model is not None and model["max_probability"] >= t.model_review and not advice
    if model_only:
        reasons.append("No known tactic matched, but the wording resembles spam or scam texts. "
                       "This may be a tactic the rules do not cover yet.")
    # A model-only signal is reported as uncertainty but does not trigger review: the spam model also
    # rates many genuine bank notifications as spam-like, and reviewing them all would cause alert fatigue.
    unc_level = "high" if len(reasons) >= 2 or conflicts else "medium" if reasons else "low"
    review_reasons = []
    if conflicts:
        review_reasons.append("Conflicting evidence")
    if unc_level == "high" and level != "low":
        review_reasons.append("High uncertainty")
    if poor and level != "low":
        review_reasons.append("Poor-quality evidence")
    if poor and not agg:
        review_reasons.append("Evidence could not be read")

    dq_levels = [e["detection"].get("data_quality", {}).get("level", "good") for e in ordered]
    dq = "poor" if "poor" in dq_levels else "limited" if "limited" in dq_levels else "good" if dq_levels else "none"

    recs = _recommendations(agg, level, bool(review_reasons))
    indicators = _merge_indicators(ordered)
    result = {
        "risk_score": score, "risk_level": level, "score_label": SCORE_LABEL,
        "thresholds": {"medium": t.medium, "high": t.high},
        "components": sorted(components, key=lambda c: -c["weight"]),
        "mitigations": mitigations,
        "tactics": sorted(agg.values(), key=lambda a: (a["first_position"], -a["severity"])),
        "stages_observed": stages,
        "order": {**order, "sequence": [e["id"] for e in ordered]},
        "chain": _chain(ordered, agg, order),
        "uncertainty": {"level": unc_level, "reasons": reasons},
        "review_required": bool(review_reasons), "review_reasons": review_reasons,
        "data_quality": {"level": dq, "notes": [n for e in ordered for n in e["detection"].get("data_quality", {}).get("notes", [])][:5]},
        "model_signal": model,
        "missing_evidence": missing, "conflicts": conflicts,
        "recommendations": recs, "primary_action": recs[0] if recs else "Add evidence to start the assessment.",
        "indicators": indicators,
        "event_count": len(ordered),
    }
    result["fingerprint"] = fingerprint(result)
    return result


def fingerprint(a: dict) -> str:
    """What makes two assessments 'the same' for alerting purposes."""
    material = {
        "level": a["risk_level"], "review": a["review_required"],
        "tactics": sorted(t["code"] for t in a["tactics"]),
        "domains": a["indicators"].get("domains", []), "upi": a["indicators"].get("upi_handles", []),
    }
    return hashlib.sha256(json.dumps(material, sort_keys=True).encode()).hexdigest()[:32]


def _merge_indicators(ordered: list[dict]) -> dict:
    out: dict[str, set] = {}
    for e in ordered:
        for k, v in e["detection"].get("indicators", {}).items():
            out.setdefault(k, set()).update(v)
    return {k: sorted(v) for k, v in out.items()}


def _conflicts(ordered: list[dict]) -> list[str]:
    out = []
    asks = [e for e in ordered if any(t["code"] in ("secret_request", "upi_collect") for t in e["detection"]["tactics"])]
    advises = [e for e in ordered if e["detection"].get("safety_advice")]
    for a in advises:
        for b in asks:
            if a["id"] == b["id"]:
                out.append(f"Event #{a['seq']} both warns against sharing codes and asks for one. Scammers copy bank "
                           "wording to look genuine, so the request matters more than the warning.")
            elif len(out) < 4:
                out.append(f"Event #{a['seq']} reads like a genuine safety notice, while event #{b['seq']} asks for a "
                           "code or PIN. Check that both really belong to the same conversation; a genuine bank "
                           "message does not make a later request genuine.")
    for e in ordered:
        for org in e["detection"].get("claimed_orgs", []):
            offic = official_domains(org)
            for u in e["detection"].get("urls", []):
                if u["registered_domain"] in offic and e["detection"]["tactics"]:
                    out.append(f"Event #{e['seq']} links to {u['registered_domain']}, an official domain of the "
                               f"organisation it names, yet uses pressure tactics. The link may be genuine even if "
                               "the message is not; verify through the official app.")
    seen, uniq = set(), []
    for c in out:
        if c not in seen:
            seen.add(c)
            uniq.append(c)
    return uniq[:5]


def _missing(ordered: list[dict], agg: dict, stages: list[str], order: dict) -> list[str]:
    if not ordered:
        return ["Add a suspicious message, link or screenshot to start the investigation."]
    out = []
    codes = set(agg)
    if agg and not {"harvest", "control", "extraction"} & set(stages):
        out.append("No request for codes, log-ins, app installs or money has been seen yet. Scams usually escalate; "
                   "add follow-up messages if they arrive.")
    if {"harvest", "control"} & set(stages) and "extraction" not in stages:
        out.append("No payment step has been observed. Whether any money was requested by phone is unknown.")
    if codes & {"credential_link", "suspicious_link"}:
        out.append("Links were not opened (by design), so whether the page is live and who runs it were not checked.")
    if "secret_request" in codes:
        out.append("It is unknown whether a code, PIN or password was already shared. If it was, call your bank now.")
    orgs = sorted({o for e in ordered for o in e["detection"].get("claimed_orgs", [])})
    if orgs and agg:
        out.append(f"The claimed sender ({', '.join(o.upper() for o in orgs[:3])}) has not been verified through an "
                   "official channel.")
    if len(ordered) > 1 and not order["known"]:
        out.append("The real order of events is not confirmed; add when each message was received.")
    return out[:6]


def _recommendations(agg: dict, level: str, review: bool) -> list[str]:
    if not agg:
        base = ["No scam tactics were found in this evidence. That is not proof it is safe: never share codes or "
                "PINs, and verify requests for money through a channel you already trust."]
        if review:
            base.insert(0, "Treat this as unconfirmed: the wording resembles scam messages even though no specific "
                           "tactic matched. Verify with the sender through an official channel before acting.")
        return base
    stages = {a["stage"] for a in agg.values()}
    if "extraction" in stages:
        first = "Stop: do not approve any request, scan any QR code, pay or transfer money."
    elif "control" in stages:
        first = "Do not install anything or share your screen. Uninstall any app you installed at their request."
    elif "harvest" in stages:
        first = "Do not share any code, PIN or password, and do not open the link."
    else:
        first = "Do not reply or call back on numbers in the message. Verify through the official app or website."
    recs = [first] + [TACTICS[c].recommendation for c in RECOMMENDATION_PRIORITY if c in agg]
    if level != "low" or review:
        recs.append(REPORTING)
    out, seen = [], set()
    for r in recs:
        if r not in seen:
            seen.add(r)
            out.append(r)
    return out[:7]


def _chain(ordered: list[dict], agg: dict, order: dict) -> dict:
    nodes, edges = [], []
    for i, e in enumerate(ordered):
        det = e["detection"]
        nodes.append({
            "id": f"e:{e['id']}", "type": "event", "event_id": e["id"], "position": i + 1, "seq": e["seq"],
            "kind": e["kind"], "channel": e.get("channel") or "unknown", "observed_at": e.get("observed_at"),
            "label": f"Evidence #{e['seq']}", "excerpt": (e.get("excerpt") or "")[:220],
            "signals": [t["code"] for t in det["tactics"]], "event_score": det.get("event_score", 0),
            "data_quality": det.get("data_quality", {}).get("level", "good"), "basis": "observed",
        })
        if i > 0:
            edges.append({"from": f"e:{ordered[i - 1]['id']}", "to": f"e:{e['id']}", "kind": "sequence",
                          "basis": "observed" if order["known"] else "submission_order",
                          "note": "Reported time order" if order["known"] else "Order added, not confirmed"})
    for a in agg.values():
        t = TACTICS[a["code"]]
        nodes.append({
            "id": f"t:{a['code']}", "type": "tactic", "code": a["code"], "label": a["title"], "stage": a["stage"],
            "stage_title": STAGES[a["stage"]].title, "severity": a["severity"], "evidence": a["evidence"],
            "explanation": t.explanation, "recommendation": t.recommendation,
            "basis": a["basis"], "source": a["source"],
            "confidence": ("Inferred across events" if a["basis"] == "inferred"
                           else "Link-structure heuristic" if a["source"] == "link_structure" else "Direct text match"),
        })
        for ev_id in a["events"]:
            edges.append({"from": f"e:{ev_id}", "to": f"t:{a['code']}", "kind": "evidence",
                          "basis": "inferred" if a["basis"] == "inferred" else "observed", "note": "Evidence for this tactic"})
    # Inferred progression between the earliest tactic of each consecutive observed stage.
    firsts = []
    for s in CHAIN_STAGES:
        cands = [a for a in agg.values() if a["stage"] == s]
        if cands:
            firsts.append(min(cands, key=lambda a: (a["first_position"], -a["severity"])))
    for a, b in zip(firsts, firsts[1:]):
        edges.append({"from": f"t:{a['code']}", "to": f"t:{b['code']}", "kind": "progression", "basis": "inferred",
                      "note": f"Typical escalation from {STAGES[a['stage']].title.lower()} to {STAGES[b['stage']].title.lower()}. "
                              "Inferred from the stage model, not a confirmed cause."})
    return {"nodes": nodes, "edges": edges, "stages": [{"code": s.code, "title": s.title, "order": s.order,
                                                        "description": s.description} for s in STAGES.values()]}


# ---------- change explanation ----------

def explain_change(prev: dict | None, new: dict, new_event_seq: int | None = None) -> dict:
    if prev is None:
        prev = {"risk_score": 0, "risk_level": "low", "tactics": [], "stages_observed": [], "review_required": False,
                "components": []}
    before = {t["code"]: t for t in prev.get("tactics", [])}
    after = {t["code"]: t for t in new["tactics"]}
    added = [after[c] for c in after if c not in before]
    removed = [before[c] for c in before if c not in after]
    stages_added = [s for s in new["stages_observed"] if s not in prev.get("stages_observed", [])]
    lines = []
    src = f" from evidence #{new_event_seq}" if new_event_seq else ""
    if added:
        lines.append("New tactics" + src + ": " + "; ".join(f"{a['title']} (weight {a['severity']:.2f})" for a in added) + ".")
    if removed:
        lines.append("No longer supported: " + "; ".join(r["title"] for r in removed) + ".")
    if stages_added:
        lines.append("The attack chain now reaches: " + ", ".join(STAGES[s].title for s in stages_added) + ".")
    prev_combo = {c["label"] for c in prev.get("components", []) if c["kind"] != "tactic"}
    new_combo = [c for c in new["components"] if c["kind"] != "tactic" and c["label"] not in prev_combo]
    for c in new_combo:
        lines.append(f"Added weight for: {c['label']} (+{c['weight']:.2f}).")
    d = new["risk_score"] - prev["risk_score"]
    if d == 0 and not added and not removed:
        lines.append("Risk unchanged: the new evidence repeats tactics already in the case." if new_event_seq
                     else "Risk unchanged.")
    elif d == 0:
        lines.append("The score did not move because the strongest signals were already present.")
    if new["risk_level"] != prev["risk_level"]:
        lines.append(f"Risk level changed from {prev['risk_level']} to {new['risk_level']}.")
    if new["review_required"] and not prev.get("review_required"):
        lines.append("The case now needs review: " + ", ".join(new["review_reasons"]).lower() + ".")
    return {
        "score_before": prev["risk_score"], "score_after": new["risk_score"], "delta": d,
        "level_before": prev["risk_level"], "level_after": new["risk_level"],
        "added_tactics": [{"code": a["code"], "title": a["title"], "severity": a["severity"]} for a in added],
        "removed_tactics": [{"code": r["code"], "title": r["title"]} for r in removed],
        "stages_added": stages_added,
        "explanation": lines, "changed": bool(d or added or removed or stages_added),
    }

