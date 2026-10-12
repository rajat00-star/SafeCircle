"""Keeps the committed Scam DNA evaluation results in step with the engine."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVAL = ROOT / "evaluation" / "scam_dna"


def test_committed_results_match_the_current_engine():
    spec = importlib.util.spec_from_file_location("ev", EVAL / "evaluate_scam_dna.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    data = json.loads((EVAL / "scenarios_v1.json").read_text())
    committed = json.loads((EVAL / "results_v1.json").read_text())
    by_id = {r["id"]: r for r in committed["rows"]}
    for sc in data["scenarios"]:
        a = mod.run_scenario(sc, mod.Thresholds())
        flagged = a["risk_level"] != "low" or a["review_required"]
        assert flagged == by_id[sc["id"]]["flagged"], f"{sc['id']} changed; re-run evaluate_scam_dna.py"
    assert "DEMO DATA" in data["label"]
