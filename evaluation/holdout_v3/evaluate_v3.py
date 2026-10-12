"""Evaluate SafeCircle on the synthetic set v3 (DEMO DATA) through the real HTTP API.

Usage (from the repository root):
    backend/.venv/bin/python evaluation/holdout_v3/evaluate_v3.py --out results_v3_<label>.json

Reuses the v2 evaluator unchanged (same throwaway database, same endpoints, same outcome definitions and
baselines); only the dataset, checksum and output folder differ. backend/safecircle.db is never opened.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("evaluate_holdout_v2", HERE.parent / "holdout_v2" / "evaluate_holdout.py")
v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)
v2.HERE = HERE
v2.DATASET = HERE / "dataset_v3.json"
v2.CHECKSUM = HERE / "dataset_v3.sha256"

if __name__ == "__main__":
    v2.main()
