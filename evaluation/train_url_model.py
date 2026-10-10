"""Train the hostname model used by the URL analyser.

Trains a character n-gram logistic regression on HOSTNAMES only (never paths),
because the benign source (Cisco Umbrella top-1M) contains hostnames without
paths; learning from paths would just learn "has a path = phishing".

Training data is a development sample that is disjoint from the evaluation
sample in evaluation/data/phishing_urls_sample.txt and from the benign
evaluation sample (see evaluation/README.md).

Usage:
  python evaluation/train_url_model.py --phish dev_phish.txt --benign dev_benign.txt
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "backend" / "app" / "detector" / "models"
SEED = 42


def host_of(u: str) -> str:
    try:
        return (urlsplit(u if "://" in u else "http://" + u).hostname or "").lower()
    except ValueError:
        return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phish", type=Path, required=True)
    ap.add_argument("--benign", type=Path, required=True)
    args = ap.parse_args()

    eval_phish_hosts = {host_of(l) for l in (ROOT / "evaluation/data/phishing_urls_sample.txt").read_text().split()}
    phish = sorted({host_of(l) for l in args.phish.read_text().split()} - eval_phish_hosts - {""})
    benign = sorted({l.strip().lower() for l in args.benign.read_text().split()} - {""})
    X = phish + benign
    y = [1] * len(phish) + [0] * len(benign)
    X_tr, X_val, y_tr, y_val = train_test_split(X, y, test_size=0.2, stratify=y, random_state=SEED)

    pipe = Pipeline([
        ("tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True, min_df=3,
                                  max_features=50000)),
        ("clf", LogisticRegression(max_iter=3000, C=3.0, class_weight="balanced")),
    ])
    pipe.fit(X_tr, y_tr)
    pv = pipe.predict(X_val)
    val = {"precision": round(precision_score(y_val, pv), 4), "recall": round(recall_score(y_val, pv), 4),
           "f1": round(f1_score(y_val, pv), 4)}
    pipe.fit(X, y)  # refit on the whole development sample

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / "url_model.joblib"
    joblib.dump(pipe, path, compress=3)
    meta = {
        "version": "host-char-lr-1.0",
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "phishing_hosts": len(phish), "benign_hosts": len(benign),
        "dev_validation@0.5": val,
        "sources": "Phishing.Database (MIT) dev sample; Cisco Umbrella top-1M dev sample",
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }
    (OUT_DIR / "url_model.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
