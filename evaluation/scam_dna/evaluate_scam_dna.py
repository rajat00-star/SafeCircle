"""Evaluate Scam DNA case assessment on the versioned synthetic scenario set.

Usage (from the repository root):
    backend/.venv/bin/python evaluation/scam_dna/evaluate_scam_dna.py

Each scenario's events are analysed in order with the same code the API uses (detect -> redact ->
assess_case). Nothing is stored. Writes evaluation/scam_dna/results_v1.json and prints a summary.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("SAFECIRCLE_SECRET_KEY", "evaluation-only-secret-key")
os.environ.setdefault("SAFECIRCLE_DATABASE_URL", "sqlite://")

from app.scamdna.assessment import Thresholds, assess_case  # noqa: E402
from app.services.cases import EventInput, build_detection, detect  # noqa: E402
from app.scamdna.evidence import redact_evidence  # noqa: E402

HERE = Path(__file__).resolve().parent
DATASET = HERE / "scenarios_v1.json"
OUT = HERE / "results_v1.json"


def run_scenario(sc: dict, t: Thresholds) -> dict:
    events = []
    for i, ev in enumerate(sc["events"], 1):
        inp = EventInput(ev["kind"], ev["content"], ev.get("channel", "unknown"))
        events.append({"id": f"e{i}", "seq": i, "kind": inp.kind, "channel": inp.channel, "observed_at": None,
                       "excerpt": redact_evidence(inp.text), "detection": build_detection(inp, detect(inp))})
    return assess_case(events, t)


def main() -> None:
    data = json.loads(DATASET.read_text())
    t = Thresholds()
    rows, tp, fp, tn, fn = [], 0, 0, 0, 0
    level_agree, tac_expected, tac_found = 0, 0, 0
    for sc in data["scenarios"]:
        a = run_scenario(sc, t)
        flagged = a["risk_level"] != "low" or a["review_required"]
        scam = sc["label"] == "scam"
        tp += flagged and scam
        fp += flagged and not scam
        tn += (not flagged) and not scam
        fn += (not flagged) and scam
        got_level = "review" if a["review_required"] and a["risk_level"] == "low" else a["risk_level"]
        level_agree += got_level == sc["expected"]
        codes = {x["code"] for x in a["tactics"]}
        tac_expected += len(sc["tactics"])
        tac_found += sum(1 for c in sc["tactics"] if c in codes)
        rows.append({"id": sc["id"], "label": sc["label"], "description": sc["description"],
                     "expected": sc["expected"], "got_level": a["risk_level"], "score": a["risk_score"],
                     "review_required": a["review_required"], "flagged": flagged,
                     "correct": flagged == scam, "expected_tactics": sc["tactics"],
                     "missed_tactics": [c for c in sc["tactics"] if c not in codes], "tactics": sorted(codes),
                     "stages": a["stages_observed"]})
    n = len(rows)
    metrics = {
        "scenarios": n, "scam": tp + fn, "benign": tn + fp,
        "confusion_matrix": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
        "precision": round(tp / (tp + fp), 3) if tp + fp else None,
        "recall": round(tp / (tp + fn), 3) if tp + fn else None,
        "false_positive_rate": round(fp / (fp + tn), 3) if fp + tn else None,
        "accuracy": round((tp + tn) / n, 3),
        "expected_level_agreement": round(level_agree / n, 3),
        "expected_tactic_recall": round(tac_found / tac_expected, 3) if tac_expected else None,
        "thresholds": {"medium": t.medium, "high": t.high},
    }
    OUT.write_text(json.dumps({"dataset": DATASET.name, "dataset_version": data["version"],
                               "label": data["label"], "positive_definition": data["positive_definition"],
                               "caveat": data["notes"], "metrics": metrics, "rows": rows}, indent=2) + "\n")
    print(json.dumps(metrics, indent=2))
    for r in rows:
        mark = "ok " if r["correct"] else "ERR"
        miss = f" missed={r['missed_tactics']}" if r["missed_tactics"] else ""
        print(f"{mark} {r['id']} {r['label']:6} expected={r['expected']:6} got={r['got_level']:6} score={r['score']:3} "
              f"review={str(r['review_required'])[0]}{miss}  {r['description']}")


if __name__ == "__main__":
    main()
