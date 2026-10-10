import os
import sys
import tempfile
from pathlib import Path

_DB = Path(tempfile.mkdtemp()) / "test.db"
os.environ["SAFECIRCLE_DATABASE_URL"] = os.environ.get("SAFECIRCLE_TEST_DATABASE_URL", f"sqlite:///{_DB}")
os.environ["SAFECIRCLE_SECRET_KEY"] = "test-secret-key-for-pytest-only"
os.environ["SAFECIRCLE_LLM_PROVIDER"] = "none"
os.environ["SAFECIRCLE_LOG_LEVEL"] = "WARNING"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.security import limiter  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    limiter.reset()
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def profile(client):
    r = client.post("/api/v1/profiles", json={"display_name": "Asha"})
    assert r.status_code == 201
    data = r.json()
    return {"id": data["id"], "headers": {"Authorization": f"Bearer {data['token']}"}}
