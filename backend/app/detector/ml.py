"""Lightweight local language model (TF-IDF + logistic regression).

Trained offline by evaluation/train_message_model.py on the SMS Spam
Collection (CC BY 4.0). Runs on CPU in about a millisecond and needs no
external API. The artifact is integrity-checked with SHA-256 before loading,
because joblib files can execute code when unpickled.
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

log = logging.getLogger("safecircle.ml")

MODEL_DIR = Path(__file__).parent / "models"


@dataclass
class MlResult:
    probability: float
    top_terms: list[tuple[str, float]]


class MessageModel:
    def __init__(self, pipeline, meta: dict):
        self.pipeline = pipeline
        self.meta = meta
        self.vectorizer = pipeline.named_steps["tfidf"]
        self.clf = pipeline.named_steps["clf"]
        self.feature_names = self.vectorizer.get_feature_names_out()

    @property
    def version(self) -> str:
        return self.meta.get("version", "unknown")

    def predict(self, text: str, top_k: int = 5) -> MlResult:
        X = self.vectorizer.transform([text])
        prob = float(self.clf.predict_proba(X)[0, 1])
        coef = self.clf.coef_[0]
        row = X.tocoo()
        contribs = sorted(
            ((self.feature_names[j], float(v * coef[j])) for j, v in zip(row.col, row.data)),
            key=lambda t: t[1], reverse=True,
        )
        return MlResult(prob, [(t, round(c, 3)) for t, c in contribs[:top_k] if c > 0])


def _load_verified(name: str):
    model_path = MODEL_DIR / f"{name}.joblib"
    meta_path = MODEL_DIR / f"{name}.json"
    if not model_path.exists() or not meta_path.exists():
        log.warning("ml_model_missing", extra={"model": name})
        return None, None
    meta = json.loads(meta_path.read_text())
    if hashlib.sha256(model_path.read_bytes()).hexdigest() != meta.get("sha256"):
        log.error("ml_model_integrity_failed", extra={"model": name})
        return None, None
    import joblib  # imported lazily so the rule engine works without scikit-learn

    return joblib.load(model_path), meta


@lru_cache(maxsize=1)
def load_model() -> MessageModel | None:
    pipeline, meta = _load_verified("message_model")
    return MessageModel(pipeline, meta) if pipeline is not None else None


class HostModel:
    """Character n-gram model over hostnames (see evaluation/train_url_model.py)."""

    def __init__(self, pipeline, meta: dict):
        self.pipeline = pipeline
        self.meta = meta

    @property
    def version(self) -> str:
        return self.meta.get("version", "unknown")

    def probability(self, hostname: str) -> float:
        return float(self.pipeline.predict_proba([hostname.lower()])[0, 1])


@lru_cache(maxsize=1)
def load_url_model() -> HostModel | None:
    pipeline, meta = _load_verified("url_model")
    return HostModel(pipeline, meta) if pipeline is not None else None
