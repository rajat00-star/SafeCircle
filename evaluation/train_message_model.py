"""Train the local message model on the SMS Spam Collection (training split only).

Dataset: Almeida, T. & Hidalgo, J. (2011). SMS Spam Collection. UCI Machine
Learning Repository, https://doi.org/10.24432/C5CC84 (CC BY 4.0). The copy in
evaluation/data/ is the 5,574-message file as mirrored in
github.com/justmarkham/pycon-2016-tutorial (tab-separated label/text).

Usage: python evaluation/train_message_model.py
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.detector.normalize import normalize  # noqa: E402

DATA = ROOT / "evaluation" / "data" / "sms_spam_collection.tsv"
OUT_DIR = ROOT / "backend" / "app" / "detector" / "models"
SPLIT_FILE = ROOT / "evaluation" / "data" / "sms_split.json"
SEED = 42


def load_sms():
    texts, labels = [], []
    for line in DATA.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        label, text = line.split("\t", 1)
        texts.append(text)
        labels.append(1 if label == "spam" else 0)
    return texts, np.array(labels)


def split_indices(n, labels):
    idx = np.arange(n)
    train_idx, test_idx = train_test_split(idx, test_size=0.2, stratify=labels, random_state=SEED)
    return sorted(train_idx.tolist()), sorted(test_idx.tolist())


def main():
    texts, y = load_sms()
    train_idx, test_idx = split_indices(len(texts), y)
    SPLIT_FILE.write_text(json.dumps({"seed": SEED, "train": train_idx, "test": test_idx}))
    X_train = [normalize(texts[i]).text for i in train_idx]
    y_train = y[train_idx]

    pipe = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=2, max_features=20000,
                                  token_pattern=r"(?u)\b\w[\w'£$]*\b")),
        ("clf", LogisticRegression(max_iter=2000, class_weight="balanced")),
    ])
    grid = GridSearchCV(pipe, {"clf__C": [1.0, 3.0, 10.0, 30.0]}, scoring="f1",
                        cv=StratifiedKFold(5, shuffle=True, random_state=SEED), n_jobs=1)
    grid.fit(X_train, y_train)
    best = grid.best_estimator_

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    model_path = OUT_DIR / "message_model.joblib"
    joblib.dump(best, model_path, compress=3)
    digest = hashlib.sha256(model_path.read_bytes()).hexdigest()
    meta = {
        "version": "sms-tfidf-lr-1.0",
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dataset": "SMS Spam Collection (Almeida & Hidalgo, UCI, CC BY 4.0)",
        "train_size": len(train_idx),
        "test_size": len(test_idx),
        "cv_best_C": grid.best_params_["clf__C"],
        "cv_f1_mean": round(float(grid.best_score_), 4),
        "vocabulary_size": len(best.named_steps["tfidf"].vocabulary_),
        "sha256": digest,
    }
    (OUT_DIR / "message_model.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
