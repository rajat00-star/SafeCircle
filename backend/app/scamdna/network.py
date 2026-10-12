"""Scam Network Graph: cases and the indicators they share, built from data Campaign Radar already uses.

Two kinds of edge, never mixed:
  observed  case -> indicator: the indicator was extracted from that case's own evidence
  inferred  case -> case: Campaign Radar's similarity heuristics (wording, link path, tactics),
            only when no exact indicator links the pair
Phone numbers exist only as keyed hashes and are labelled as such; UPI handles are shown masked.
"""
from __future__ import annotations

from .campaigns import CaseSummary

KINDS = {"domains": "domain", "shortened_links": "short_link", "upi_handles": "upi", "phones": "phone", "orgs": "org"}
LABEL = {"domain": "Domain", "short_link": "Shortened link", "upi": "UPI handle", "phone": "Phone number", "org": "Claims to be"}


def _upi_labels(case_events: dict[str, list[dict]]) -> dict[str, str]:
    """Map a UPI hash to its masked form, using events that hold exactly one handle (otherwise ambiguous)."""
    out: dict[str, str] = {}
    for evs in case_events.values():
        for ind in evs:
            h, m = ind.get("upi_handles", []), ind.get("upi_handles_masked", [])
            if len(h) == 1 and len(m) == 1:
                out.setdefault(h[0], m[0])
    return out


def build_network(summaries: list[CaseSummary], campaign_view: dict, case_events: dict[str, list[dict]],
                  shared_only: bool = False) -> dict:
    """case_events: case id -> list of per-event indicator dicts (to label UPI handles)."""
    upi_label = _upi_labels(case_events)
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    usage: dict[str, set[str]] = {}
    for c in summaries:
        for key, kind in KINDS.items():
            for v in c.indicators.get(key, []):
                usage.setdefault(f"{kind}:{v}", set()).add(c.id)
    phone_n = 0
    for c in summaries:
        for key, kind in KINDS.items():
            for v in c.indicators.get(key, []):
                nid = f"{kind}:{v}"
                if shared_only and len(usage[nid]) < 2:
                    continue
                if nid not in nodes:
                    if kind == "phone":
                        phone_n += 1
                        label, note = f"Phone #{phone_n}", "Compared as a keyed hash; the number itself is not stored."
                    elif kind == "upi":
                        label = upi_label.get(v, "UPI handle (masked form ambiguous)")
                        note = "Masked; compared as a keyed hash."
                    elif kind == "org":
                        label, note = v.upper(), "Named in the evidence. A claim, not a verified sender."
                    else:
                        label, note = v, "Taken from link text; the link was never opened."
                    nodes[nid] = {"id": nid, "type": "indicator", "kind": kind, "kind_label": LABEL[kind],
                                  "label": label, "note": note, "case_count": len(usage[nid])}
                edges.append({"from": f"case:{c.id}", "to": nid, "basis": "observed",
                              "label": "Found in this case's evidence"})
    linked = {e["from"] for e in edges}
    for c in summaries:
        if shared_only and f"case:{c.id}" not in linked:
            continue
        nodes[f"case:{c.id}"] = {"id": f"case:{c.id}", "type": "case", "case_id": c.id, "label": c.title,
                                 "risk_level": c.risk_level, "risk_score": c.risk_score, "is_demo": c.is_demo,
                                 "tactic_count": len(c.tactics)}
    seen_pairs = set()
    for link in [l for camp in campaign_view["campaigns"] for l in camp["links"]] + campaign_view["uncertain_links"]:
        if link["exact"] or link["pair"] in seen_pairs:
            continue   # exact links are already visible as shared indicator nodes
        seen_pairs.add(link["pair"])
        if f"case:{link['a']}" in nodes and f"case:{link['b']}" in nodes:
            edges.append({"from": f"case:{link['a']}", "to": f"case:{link['b']}", "basis": "inferred",
                          "relation": link["relation"], "strength": link["strength"],
                          "label": "; ".join(f"{h['label']}: {h['value']}" for h in link["heuristic"]),
                          "uncertainty": link["uncertainty"]})
    shared = sum(1 for n in nodes.values() if n["type"] == "indicator" and n["case_count"] > 1)
    return {
        "nodes": list(nodes.values()), "edges": edges,
        "stats": {"cases": sum(1 for n in nodes.values() if n["type"] == "case"),
                  "indicators": sum(1 for n in nodes.values() if n["type"] == "indicator"),
                  "shared_indicators": shared,
                  "observed_edges": sum(1 for e in edges if e["basis"] == "observed"),
                  "inferred_edges": sum(1 for e in edges if e["basis"] == "inferred")},
        "dismissed_pairs": [l["pair"] for l in campaign_view["dismissed_links"]],
        "legend": {"observed": "Solid line: the indicator was found in that case's own evidence.",
                   "inferred": "Dashed line: Campaign Radar similarity (wording, link path or tactics). Not proof of a connection."},
        "source": "Built only from your own cases. No external threat-intelligence feed is connected.",
    }
