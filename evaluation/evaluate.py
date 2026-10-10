"""Reproducible evaluation of the SafeCircle Guardian detector.

1. Messages: held-out 20% test split of the SMS Spam Collection (same split as
   training, seed 42). Compares rules-only, ML-only and hybrid detectors.
2. URLs: phishing URLs sampled from Phishing.Database (MIT licence) against
   benign hostnames sampled from the Cisco Umbrella top-1M list. Reported both
   on full URLs and on hostnames only, because benign entries have no path and
   a path-based detector would otherwise get an unfair advantage.

Thresholds (30 = "suspicious or worse", 60 = "high risk") were fixed in the
engine before this evaluation was run. Nothing here tunes on the test data.

Usage:
  python evaluation/evaluate.py --benign-hosts /path/to/benign_hosts_sample.txt
  (see evaluation/README.md for how to create the benign sample)
"""
from __future__ import annotations

import argparse
import json
import platform
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.detector.engine import MEDIUM_THRESHOLD, HIGH_THRESHOLD, analyze_message  # noqa: E402
from app.detector.ml import load_model  # noqa: E402
from app.detector.normalize import normalize  # noqa: E402
from app.detector.rules import run_rules, score_categories  # noqa: E402
from app.detector.url_analyzer import analyze_url  # noqa: E402

DATA = ROOT / "evaluation" / "data"
RESULTS = ROOT / "evaluation" / "results"


def metrics(y_true: list[int], y_pred: list[int]) -> dict:
    tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 1)
    tn = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 0)
    fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 0)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    fpr = fp / (fp + tn) if fp + tn else 0.0
    return {
        "n": len(y_true), "positives": tp + fn, "negatives": tn + fp,
        "precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4),
        "false_positive_rate": round(fpr, 4), "accuracy": round((tp + tn) / len(y_true), 4),
        "confusion_matrix": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
    }


def latency(samples_ms: list[float]) -> dict:
    s = sorted(samples_ms)
    return {"mean_ms": round(statistics.mean(s), 3), "p50_ms": round(s[len(s) // 2], 3),
            "p95_ms": round(s[int(len(s) * 0.95) - 1], 3), "max_ms": round(s[-1], 3), "n": len(s)}


def eval_messages() -> dict:
    lines = [l for l in (DATA / "sms_spam_collection.tsv").read_text(encoding="utf-8", errors="replace").splitlines() if l.strip()]
    rows = [l.split("\t", 1) for l in lines]
    split = json.loads((DATA / "sms_split.json").read_text())
    test = [rows[i] for i in split["test"]]
    y = [1 if lab == "spam" else 0 for lab, _ in test]

    model = load_model()
    rules_pred, ml_pred, hyb30, hyb60, lat = [], [], [], [], []
    errors = {"false_positives": [], "false_negatives": []}
    for (lab, text), truth in zip(test, y):
        nt = normalize(text)
        rs, _ = score_categories(run_rules(nt).categories)
        rules_pred.append(int(rs * 100 >= MEDIUM_THRESHOLD))
        ml_pred.append(int(model.predict(nt.text).probability >= 0.5))
        t0 = time.perf_counter()
        res = analyze_message(text)
        lat.append((time.perf_counter() - t0) * 1000)
        hyb30.append(int(res.risk_score >= MEDIUM_THRESHOLD))
        hyb60.append(int(res.risk_score >= HIGH_THRESHOLD))
        if truth == 0 and hyb30[-1] and len(errors["false_positives"]) < 8:
            errors["false_positives"].append({"text": text[:160], "score": res.risk_score, "categories": res.category_codes})
        if truth == 1 and not hyb30[-1] and len(errors["false_negatives"]) < 8:
            errors["false_negatives"].append({"text": text[:160], "score": res.risk_score, "categories": res.category_codes})
    return {
        "dataset": "SMS Spam Collection, held-out 20% stratified test split (seed 42)",
        "rules_only@30": metrics(y, rules_pred),
        "ml_only@0.5": metrics(y, ml_pred),
        "hybrid@30": metrics(y, hyb30),
        "hybrid@60": metrics(y, hyb60),
        "latency_hybrid": latency(lat),
        "error_examples": errors,
    }


def host_only(url: str) -> str:
    try:
        h = urlsplit(url if "://" in url else "http://" + url).hostname or url
    except ValueError:
        h = url
    return "https://" + h + "/"


def eval_urls(benign_path: Path, n: int) -> dict:
    phish = [l.strip() for l in (DATA / "phishing_urls_sample.txt").read_text().splitlines() if l.strip()][:n]
    benign_hosts = [l.strip() for l in benign_path.read_text().splitlines() if l.strip()][:n]
    benign_full = ["https://" + h + "/" for h in benign_hosts]
    out = {"phishing_source": "Phishing.Database phishing-links-ACTIVE.txt (MIT), random sample",
           "benign_source": "Cisco Umbrella top-1M hostnames, uniform random sample", "n_per_class": n}
    variants = []
    for view, phish_set in (("full_url", phish), ("hostname_only", [host_only(u) for u in phish])):
        variants.append((f"{view}", phish_set, True))
        variants.append((f"{view}_heuristics_only", phish_set, False))
    for name, phish_set, use_model in variants:
        y, pred, lat, signal_counts = [], [], [], {}
        for label, urls in ((1, phish_set), (0, benign_full)):
            for u in urls:
                t0 = time.perf_counter()
                ua = analyze_url(u, use_model=use_model)
                lat.append((time.perf_counter() - t0) * 1000)
                y.append(label)
                pred.append(int(ua.score * 100 >= MEDIUM_THRESHOLD))
                for s in ua.signals:
                    key = f"{'phish' if label else 'benign'}:{s.code}"
                    signal_counts[key] = signal_counts.get(key, 0) + 1
        out[name] = metrics(y, pred)
        out[name]["latency"] = latency(lat)
        out[name]["signal_counts"] = dict(sorted(signal_counts.items(), key=lambda kv: -kv[1])[:30])
    return out


def plot_confusion(m: dict, title: str, path: Path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    cm = m["confusion_matrix"]
    grid = [[cm["tn"], cm["fp"]], [cm["fn"], cm["tp"]]]
    fig, ax = plt.subplots(figsize=(3.6, 3.2), dpi=160)
    ax.imshow(grid, cmap="Blues")
    for i in range(2):
        for j in range(2):
            ax.text(j, i, str(grid[i][j]), ha="center", va="center", fontsize=13,
                    color="white" if grid[i][j] > max(map(max, grid)) / 2 else "black")
    ax.set_xticks([0, 1], ["Pred. safe", "Pred. risky"])
    ax.set_yticks([0, 1], ["Actual safe", "Actual risky"])
    ax.set_title(title, fontsize=9)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--benign-hosts", type=Path, required=True)
    ap.add_argument("--n-urls", type=int, default=5000)
    args = ap.parse_args()
    RESULTS.mkdir(parents=True, exist_ok=True)
    msg = eval_messages()
    urls = eval_urls(args.benign_hosts, args.n_urls)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "environment": {"python": platform.python_version(), "machine": platform.machine(),
                        "processor_count": __import__("os").cpu_count()},
        "thresholds": {"suspicious": MEDIUM_THRESHOLD, "high": HIGH_THRESHOLD},
        "messages": msg,
        "urls": urls,
    }
    (RESULTS / "metrics.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    plot_confusion(msg["hybrid@30"], "Messages: hybrid (score ≥ 30)", RESULTS / "cm_messages_hybrid.png")
    plot_confusion(urls["full_url"], "URLs: full URL (score ≥ 30)", RESULTS / "cm_urls_full.png")
    plot_confusion(urls["hostname_only"], "URLs: hostname only (score ≥ 30)", RESULTS / "cm_urls_host.png")
    summary = {k: {kk: v[kk] for kk in ("precision", "recall", "f1", "false_positive_rate")}
               for k, v in msg.items() if isinstance(v, dict) and "precision" in v}
    summary.update({f"url_{k}": {kk: urls[k][kk] for kk in ("precision", "recall", "f1", "false_positive_rate")}
                    for k in ("full_url", "hostname_only", "full_url_heuristics_only", "hostname_only_heuristics_only")})
    card = {"generated_at": report["generated_at"], "thresholds": report["thresholds"],
            "messages_dataset": msg["dataset"], "urls_dataset": f"{urls['phishing_source']} vs {urls['benign_source']}",
            "n_urls_per_class": urls["n_per_class"], "metrics": summary,
            "latency_message_p50_ms": msg["latency_hybrid"]["p50_ms"],
            "latency_message_p95_ms": msg["latency_hybrid"]["p95_ms"],
            "latency_url_p50_ms": urls["full_url"]["latency"]["p50_ms"]}
    (ROOT / "backend/app/detector/models/evaluation_summary.json").write_text(json.dumps(card, indent=2))
    print(json.dumps(summary, indent=2))
    print("latency", msg["latency_hybrid"])


if __name__ == "__main__":
    main()
