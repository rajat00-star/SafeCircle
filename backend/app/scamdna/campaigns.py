"""Campaign Radar: correlate cases that may belong to the same scam campaign.

Transparent baseline, no learned model:
  exact indicators     same non-official domain, same link, same UPI handle, same phone (hashed)
  heuristic similarity similar message wording (word 3-gram Jaccard), same link path pattern,
                       same impersonated organisation with overlapping tactics, same money-extraction method
A "campaign" here means "cases that share indicators", never a claim that the same
criminal group is behind them. Users can dismiss any suggested relationship.

External intelligence: implement `IndicatorSource` and pass it to `correlate`. None is
connected by default, and the output says so.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Protocol

from .assessment import _similarity
from .tactics import STAGES, TACTICS

EXTRACTION = {"upi_collect", "payment_diversion", "payment_pressure"}
LINK_STRONG, LINK_LIKELY, LINK_POSSIBLE = 0.75, 0.55, 0.35
TEXT_MIN = 0.45
DISCLAIMER = ("Related by shared indicators only. This does not establish that the same people are behind these "
              "cases; that would need verified investigation.")


class IndicatorSource(Protocol):
    name: str

    def match(self, indicators: dict) -> list[dict]:
        """Return [{"indicator": ..., "label": ..., "source": name, "verified": bool}]."""


@dataclass
class CaseSummary:
    id: str
    title: str
    is_demo: bool
    risk_level: str
    risk_score: int
    tactics: list[str]
    indicators: dict
    templates: list[str]
    updated_at: str | None = None


def pair_key(a: str, b: str) -> str:
    return "|".join(sorted((a, b)))


def relate(a: CaseSummary, b: CaseSummary) -> dict | None:
    ia, ib = a.indicators, b.indicators
    evidence = []
    for kind, label in (("domains", "Same domain"), ("links", "Same link"), ("upi_handles", "Same UPI handle"),
                        ("phones", "Same phone number")):
        shared = sorted(set(ia.get(kind, [])) & set(ib.get(kind, [])))
        for v in shared[:3]:
            shown = v
            if kind == "upi_handles":
                shown = "(masked) " + ", ".join(sorted(set(ia.get("upi_handles_masked", [])) & set(ib.get("upi_handles_masked", [])))[:1] or ["handle"])
            if kind == "phones":
                shown = "(compared as a keyed hash; the number is not stored)"
            evidence.append({"type": kind, "label": label, "value": shown, "basis": "exact", "weight": 0.9})

    heur = []
    best = max((_similarity(x, y) for x in a.templates for y in b.templates if len(x.split()) >= 6 and len(y.split()) >= 6),
               default=0.0)
    if best >= TEXT_MIN:
        heur.append({"type": "wording", "label": "Similar message wording", "value": f"{round(best * 100)}% word-sequence overlap",
                     "basis": "heuristic", "weight": round(min(0.85, best * 0.85), 3)})
    paths = sorted(set(ia.get("path_patterns", [])) & set(ib.get("path_patterns", [])))
    paths = [p for p in paths if p.count("/") >= 1 and len(p) > 4]
    if paths:
        heur.append({"type": "path", "label": "Same link path pattern", "value": paths[0], "basis": "heuristic", "weight": 0.35})
    orgs = sorted(set(ia.get("orgs", [])) & set(ib.get("orgs", [])))
    ta, tb = set(a.tactics) - {"repeated_indicator"}, set(b.tactics) - {"repeated_indicator"}
    jac = len(ta & tb) / len(ta | tb) if ta | tb else 0.0
    if orgs and jac >= 0.5:
        heur.append({"type": "org_tactics", "label": "Same impersonated organisation and similar tactics",
                     "value": f"{', '.join(o.upper() for o in orgs[:2])}; {round(jac * 100)}% tactic overlap",
                     "basis": "heuristic", "weight": 0.3})
    ext = sorted((ta & tb) & EXTRACTION - {"payment_pressure"})
    if ext:
        heur.append({"type": "extraction", "label": "Same money-extraction method",
                     "value": ", ".join(TACTICS[c].title for c in ext), "basis": "heuristic", "weight": 0.15})

    if not evidence and not heur:
        return None
    p = 1.0
    for e in evidence + heur:
        p *= 1 - e["weight"]
    strength = round(1 - p, 3)
    if strength < LINK_POSSIBLE:
        return None
    rel = "strong" if evidence and strength >= LINK_STRONG else "likely" if strength >= LINK_LIKELY else "possible"
    if not evidence and rel == "strong":
        rel = "likely"   # heuristic similarity alone never counts as a strong link
    uncertainty = ("Exact shared indicator." if evidence else
                   "Similarity only: no exact indicator is shared, so these may be unrelated cases using a common template."
                   if rel != "possible" else "Weak similarity: shown for review, not grouped.")
    return {"pair": pair_key(a.id, b.id), "a": a.id, "b": b.id, "strength": strength, "relation": rel,
            "exact": evidence, "heuristic": heur, "uncertainty": uncertainty}


def correlate(cases: list[CaseSummary], dismissed: set[str] | None = None,
              sources: list[IndicatorSource] | None = None) -> dict:
    dismissed = dismissed or set()
    eligible = [c for c in cases if c.tactics]          # benign cases never form campaigns
    links, uncertain, dismissed_links = [], [], []
    for i in range(len(eligible)):
        for j in range(i + 1, len(eligible)):
            r = relate(eligible[i], eligible[j])
            if r is None:
                continue
            if r["pair"] in dismissed:
                dismissed_links.append(r)
            elif r["relation"] == "possible":
                uncertain.append(r)
            else:
                links.append(r)

    parent = {c.id: c.id for c in eligible}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for r in links:
        parent[find(r["a"])] = find(r["b"])
    groups: dict[str, list[CaseSummary]] = {}
    for c in eligible:
        groups.setdefault(find(c.id), []).append(c)

    by_id = {c.id: c for c in eligible}
    campaigns = []
    for members in groups.values():
        if len(members) < 2:
            continue
        ids = {m.id for m in members}
        clinks = [r for r in links if r["a"] in ids and r["b"] in ids]
        exact = sorted({f"{e['label']}: {e['value']}" for r in clinks for e in r["exact"]})
        # One line per kind of similarity, showing its strongest instance.
        best: dict[str, dict] = {}
        for e in (e for r in clinks for e in r["heuristic"]):
            if e["label"] not in best or e["weight"] > best[e["label"]]["weight"]:
                best[e["label"]] = e
        heur = sorted(f"{e['label']}: {e['value']}" for e in best.values())
        orgs = sorted({o for m in members for o in m.indicators.get("orgs", [])})
        tac_count: dict[str, int] = {}
        for m in members:
            for t in m.tactics:
                tac_count[t] = tac_count.get(t, 0) + 1
        # Most shared first; among equals prefer later-stage, more severe tactics (they define the scheme).
        common = [t for t, n in sorted(tac_count.items(), key=lambda kv: (-kv[1], -STAGES[TACTICS[kv[0]].stage].order,
                                                                           -TACTICS[kv[0]].severity))
                  if n >= 2 and t in TACTICS and t != "authority_impersonation"][:4]
        label = (" / ".join(o.upper() for o in orgs[:2]) + " · " if orgs else "") + \
                (TACTICS[common[0]].title if common else "Shared indicators")
        cid = hashlib.sha256(",".join(sorted(ids)).encode()).hexdigest()[:12]
        external = []
        for s in sources or []:
            for m in members:
                external.extend(s.match(m.indicators))
        campaigns.append({
            "id": cid, "label": label,
            "member_ids": sorted(ids, key=lambda x: by_id[x].title),
            "members": [{"id": m.id, "title": m.title, "risk_level": m.risk_level, "risk_score": m.risk_score,
                         "is_demo": m.is_demo} for m in sorted(members, key=lambda m: m.title)],
            "links": clinks, "exact_indicators": exact, "heuristic_indicators": heur, "common_tactics": common,
            "confidence": "exact indicators shared" if exact else "similarity only",
            "is_demo": all(m.is_demo for m in members),
            "external_matches": external, "disclaimer": DISCLAIMER,
        })
    campaigns.sort(key=lambda c: (-len(c["members"]), c["label"]))
    return {
        "campaigns": campaigns, "uncertain_links": uncertain, "dismissed_links": dismissed_links,
        "cases_considered": len(eligible), "cases_excluded_low_risk": len(cases) - len(eligible),
        "method": "Exact indicator matching plus word 3-gram Jaccard similarity, path patterns and tactic overlap. "
                  "No machine-learned model.",
        "external_sources": [s.name for s in sources or []],
        "external_note": "No verified threat-intelligence feed is connected; only your own cases are compared."
                         if not sources else "",
    }
