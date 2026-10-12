"""Alert decisions with duplicate suppression, to avoid alert fatigue.

An alert is raised only when the assessment materially changes:
  new         first time a case reaches medium or high risk (or needs review)
  escalated   the risk level rose since the last alert
  updated     a new high-severity tactic appeared without a level change
  suppressed  nothing material changed since the last alert (same fingerprint, or minor additions)
  none        low risk and nothing to report
Every decision, including suppressions, is written to the case log.
"""
from __future__ import annotations

from dataclasses import dataclass

RANK = {"low": 0, "medium": 1, "high": 2}
MATERIAL_SEVERITY = 0.45


@dataclass
class AlertDecision:
    action: str          # new | escalated | updated | deescalated | suppressed | none
    notify: bool
    reason: str


def decide_alert(last_alert: dict | None, assessment: dict) -> AlertDecision:
    """last_alert: {"fingerprint", "risk_level", "tactics": [codes]} of the last *notifying* alert, or None."""
    level = assessment["risk_level"]
    alertable = level != "low" or assessment["review_required"]
    if last_alert is None:
        if alertable:
            why = "needs review" if level == "low" else f"reached {level} risk"
            return AlertDecision("new", True, f"First alert: the case {why}.")
        return AlertDecision("none", False, "Low risk; no alert.")
    if assessment["fingerprint"] == last_alert["fingerprint"]:
        return AlertDecision("suppressed", False, "Duplicate suppressed: the evidence did not change the assessment.")
    if RANK[level] > RANK[last_alert["risk_level"]]:
        return AlertDecision("escalated", True, f"Escalated from {last_alert['risk_level']} to {level} risk.")
    if RANK[level] < RANK[last_alert["risk_level"]]:
        return AlertDecision("deescalated", False, f"Risk fell from {last_alert['risk_level']} to {level}; recorded without an alert.")
    prev = set(last_alert.get("tactics", []))
    material = [t for t in assessment["tactics"] if t["code"] not in prev and t["severity"] >= MATERIAL_SEVERITY]
    if material:
        return AlertDecision("updated", True, "Updated: new high-severity evidence (" + ", ".join(t["title"] for t in material) + ").")
    return AlertDecision("suppressed", False, "Suppressed: only minor signals were added; the risk level is unchanged.")
