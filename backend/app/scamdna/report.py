"""One-click evidence report for a Scam DNA case.

Built only from what the case already stores (redacted evidence, detections, assessment,
log and Campaign Radar links), so the report never contains an OTP, PIN, password, card
or account number, phone number, e-mail address or screenshot image. The user reviews it
in the app and exports it themselves; nothing is sent anywhere.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from .assessment import REPORTING, SCORE_LABEL

NOT_SUBMITTED = ("This report was prepared by the user with SafeCircle Guardian. It has NOT been submitted to the "
                 "police, a bank or any authority. To report, use cybercrime.gov.in or call 1930 and attach it yourself.")
EXCLUDED = ["One-time codes, PINs, passwords and CVVs (removed before storage)",
            "Card and account numbers, phone numbers and e-mail addresses (removed before storage)",
            "Screenshot images (never stored; only their SHA-256, size and the redacted extracted text)",
            "Query strings of links (removed before storage)"]
CHANNEL = {"sms": "SMS", "whatsapp": "WhatsApp", "email": "E-mail", "call": "Phone call", "upi_app": "UPI app",
           "browser": "Browser", "social": "Social media", "other": "Other", "unknown": "Not specified"}


def _iso(d) -> str | None:
    if d is None:
        return None
    if isinstance(d, str):
        return d
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).isoformat(timespec="seconds")


def build_report(case, campaigns: dict, include_excerpts: bool = True, include_related: bool = True,
                 now: datetime | None = None) -> dict:
    a = case.assessment or {}
    order = {eid: i for i, eid in enumerate((a.get("order") or {}).get("sequence", []))}
    events = sorted(case.events, key=lambda e: order.get(e.id, 10_000 + e.seq))
    timeline = []
    for e in events:
        det = e.detection or {}
        timeline.append({
            "seq": e.seq, "kind": e.kind, "channel": CHANNEL.get(e.channel, e.channel),
            "received_at": _iso(e.observed_at), "received_at_note": None if e.observed_at else "Not reported by the user",
            "added_at": _iso(e.created_at), "source": "DEMO DATA (synthetic)" if e.source == "demo_fixture" else "Submitted by the user",
            "excerpt": e.excerpt if include_excerpts else "[excerpt omitted by the user]",
            "content_sha256": e.content_sha256,
            "tactics": [{"title": t["title"], "basis": t.get("basis", "text_match"),
                         "evidence": [x["text"] for x in t.get("evidence", [])][:3] if include_excerpts else []}
                        for t in det.get("tactics", [])],
            "links": [{"url": u["url"], "domain": u.get("registered_domain"), "signals": [s["title"] for s in u.get("signals", [])]}
                      for u in det.get("urls", [])],
            "screenshot": ({k: e.media.get(k) for k in ("mime", "size_bytes", "width", "height", "sha256", "ocr_confidence")}
                           if e.media else None),
            "data_quality": det.get("data_quality", {}).get("level"),
        })
    ind = a.get("indicators", {})
    indicators = {
        "domains": ind.get("domains", []), "links": ind.get("links", []), "shortened_links": ind.get("shortened_links", []),
        "upi_handles_masked": ind.get("upi_handles_masked", []),
        "phone_numbers": f"{len(ind.get('phones', []))} distinct number(s), kept only as keyed hashes" if ind.get("phones") else None,
        "claimed_organisations": [o.upper() for o in ind.get("orgs", [])],
    }
    related = []
    if include_related:
        for c in campaigns.get("campaigns", []):
            if case.id not in c["member_ids"]:
                continue
            for link in c["links"]:
                if case.id not in (link["a"], link["b"]):
                    continue
                other = next(m for m in c["members"] if m["id"] == (link["b"] if link["a"] == case.id else link["a"]))
                related.append({"case_title": other["title"], "is_demo": other["is_demo"], "relation": link["relation"],
                                "exact": [f"{x['label']}: {x['value']}" for x in link["exact"]],
                                "heuristic": [f"{x['label']}: {x['value']}" for x in link["heuristic"]],
                                "uncertainty": link["uncertainty"]})
    alerts = [{"at": _iso(l.at), "decision": l.alert_action, "notified": l.notify, "risk_level": l.risk_level,
               "risk_score": l.risk_score, "reason": (l.detail or {}).get("reason")}
              for l in case.log if l.alert_action]
    body = {
        "title": case.title, "case_status": case.status, "is_demo": case.is_demo,
        "demo_notice": "DEMO DATA: every piece of evidence in this case is synthetic." if case.is_demo else None,
        "created_at": _iso(case.created_at), "updated_at": _iso(case.updated_at),
        "assessment": {
            "risk_score": case.risk_score, "risk_level": case.risk_level, "score_label": SCORE_LABEL,
            "thresholds": a.get("thresholds"), "components": a.get("components", []),
            "stages_observed": a.get("stages_observed", []), "order_note": (a.get("order") or {}).get("note"),
            "uncertainty": a.get("uncertainty", {}), "review_required": case.review_required,
            "review_reasons": a.get("review_reasons", []), "conflicts": a.get("conflicts", []),
            "missing_evidence": a.get("missing_evidence", []),
        },
        "tactics": [{"title": t["title"], "stage": t["stage"], "basis": t["basis"], "severity": t["severity"],
                     "evidence": [x["text"] for x in t.get("evidence", [])] if include_excerpts else []}
                    for t in a.get("tactics", [])],
        "timeline": timeline, "indicators": indicators, "related_cases": related,
        "related_note": ("Related by shared indicators only; this does not establish that the same people are behind them."
                         if related else ("Not included." if not include_related else "No related cases among your investigations.")),
        "alert_history": alerts, "recommendations": a.get("recommendations", []), "how_to_report": REPORTING,
        "excluded_by_design": EXCLUDED,
        "options": {"include_excerpts": include_excerpts, "include_related": include_related},
    }
    digest = hashlib.sha256(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()
    return {"report_version": 1, "generated_at": _iso(now or datetime.now(timezone.utc)),
            "generator": "SafeCircle Guardian (rule-based Scam DNA engine)", "submission_status": NOT_SUBMITTED,
            "content_sha256": digest, **body}


def to_markdown(r: dict) -> str:
    L: list[str] = []
    w = L.append
    if r["is_demo"]:
        w("> **DEMO DATA** - every piece of evidence in this case is synthetic.\n")
    w(f"# Scam evidence report: {r['title']}\n")
    w(f"> {r['submission_status']}\n")
    a = r["assessment"]
    w(f"- Generated: {r['generated_at']}  ")
    w(f"- Case created: {r['created_at']} · last updated: {r['updated_at']} · status: {r['case_status']}  ")
    w(f"- Report fingerprint (SHA-256 of contents): `{r['content_sha256']}`\n")
    w("## Assessment\n")
    w(f"**Risk {a['risk_level'].upper()} ({a['risk_score']}/100).** {a['score_label']}\n")
    if a.get("stages_observed"):
        w("Attack stages seen: " + ", ".join(a["stages_observed"]) + ".\n")
    unc = a.get("uncertainty") or {}
    w(f"Uncertainty: **{unc.get('level', 'n/a')}**" + (". " + " ".join(unc.get("reasons", [])) if unc.get("reasons") else ".") + "\n")
    if a["review_required"]:
        w("Needs human review: " + ", ".join(a["review_reasons"]) + ".\n")
    if a.get("components"):
        w("| Weight | Contribution |\n|---|---|")
        for c in a["components"]:
            w(f"| {c['weight']:.2f} | {c['label']} ({c['kind']}) |")
        w("")
    for title, key in (("Conflicting evidence", "conflicts"), ("Missing or unverified", "missing_evidence")):
        if a.get(key):
            w(f"### {title}\n")
            L.extend(f"- {x}" for x in a[key])
            w("")
    w("## Tactics detected\n")
    if not r["tactics"]:
        w("No scam tactics were detected.\n")
    for t in r["tactics"]:
        w(f"- **{t['title']}** ({t['stage']}, {t['basis']}, weight {t['severity']:.2f})")
        L.extend(f"  - \"{x}\"" for x in t["evidence"][:3])
    w("\n## Evidence timeline\n")
    if a.get("order_note"):
        w(f"_{a['order_note']}_\n")
    for e in r["timeline"]:
        when = e["received_at"] or e["received_at_note"]
        w(f"### #{e['seq']} · {e['kind']} · {e['channel']}\n")
        w(f"- Received: {when} · added: {e['added_at']} · {e['source']}")
        w(f"- SHA-256: `{e['content_sha256']}`")
        if e["screenshot"]:
            s = e["screenshot"]
            w(f"- Screenshot: {s['mime']}, {s['width']}x{s['height']}, {s['size_bytes']} bytes, OCR confidence {s['ocr_confidence']} (image not stored)")
        w("")
        w("```text\n" + e["excerpt"].replace("```", "'''") + "\n```")
        if e["tactics"]:
            w("Tactics: " + "; ".join(t["title"] for t in e["tactics"]))
        for u in e["links"]:
            w(f"- Link `{u['url']}`" + (": " + ", ".join(u["signals"]) if u["signals"] else ""))
        w("")
    ind = r["indicators"]
    w("## Indicators\n")
    rows = [("Domains", ind["domains"]), ("Links", ind["links"]), ("Shortened links", ind["shortened_links"]),
            ("UPI handles (masked)", ind["upi_handles_masked"]), ("Claimed organisations", ind["claimed_organisations"])]
    for label, vals in rows:
        if vals:
            w(f"- {label}: " + ", ".join(f"`{v}`" for v in vals))
    if ind["phone_numbers"]:
        w(f"- Phone numbers: {ind['phone_numbers']}")
    w("\n## Related cases\n")
    w(r["related_note"] + "\n")
    for c in r["related_cases"]:
        w(f"- {'DEMO: ' if c['is_demo'] else ''}{c['case_title']} ({c['relation']}): " +
          "; ".join(c["exact"] + c["heuristic"]) + f". {c['uncertainty']}")
    if r["alert_history"]:
        w("\n## Alert decisions\n")
        for x in r["alert_history"]:
            w(f"- {x['at']}: {x['decision']} ({x['risk_level']}, {x['risk_score']}){' - notified' if x['notified'] else ''}. {x['reason'] or ''}")
    w("\n## Recommended actions\n")
    L.extend(f"{i}. {x}" for i, x in enumerate(r["recommendations"], 1))
    w(f"\n{r['how_to_report']}\n")
    w("## Not included by design\n")
    L.extend(f"- {x}" for x in r["excluded_by_design"])
    w("")
    return "\n".join(L)
