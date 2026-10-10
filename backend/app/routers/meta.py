import json
from pathlib import Path

from fastapi import APIRouter
from sqlalchemy import text

from ..config import get_settings
from ..db import engine
from ..detector.engine import ENGINE_VERSION, HIGH_THRESHOLD, MEDIUM_THRESHOLD
from ..detector.ml import load_model, load_url_model
from ..detector.rules import CATEGORIES

router = APIRouter(tags=["meta"])
EVAL_SUMMARY = Path(__file__).resolve().parents[1] / "detector" / "models" / "evaluation_summary.json"


@router.get("/health")
def health():
    db_ok = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "database": db_ok, "engine_version": ENGINE_VERSION,
            "message_model_loaded": load_model() is not None, "url_model_loaded": load_url_model() is not None}


@router.get("/meta/model-card", summary="How the detector works and how it was evaluated")
def model_card():
    m, u = load_model(), load_url_model()
    s = get_settings()
    return {
        "engine_version": ENGINE_VERSION,
        "thresholds": {"suspicious": MEDIUM_THRESHOLD, "high": HIGH_THRESHOLD},
        "tactic_categories": [{"code": c.code, "title": c.title, "weight": c.weight, "explanation": c.explanation}
                              for c in CATEGORIES.values()],
        "message_model": m.meta if m else None,
        "url_model": u.meta if u else None,
        "ai_explanations_enabled": s.llm_provider == "anthropic" and bool(s.anthropic_api_key),
        "evaluation": json.loads(EVAL_SUMMARY.read_text()) if EVAL_SUMMARY.exists() else None,
    }
