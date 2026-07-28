"""
/api/voice/transcribe must require authentication — previously it was open with
a client-supplied rate-limit key, enabling anonymous CPU-heavy transcription DoS.
"""
import importlib
import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    importlib.reload(auth_module)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    from fastapi.testclient import TestClient
    return TestClient(main_mod.app)


def test_transcribe_requires_auth(client):
    # No Authorization header → 401, before any audio/model work.
    r = client.post("/api/voice/transcribe",
                    files={"audio": ("clip.webm", b"\x00" * 32, "audio/webm")},
                    data={"language": "en"})
    assert r.status_code == 401
