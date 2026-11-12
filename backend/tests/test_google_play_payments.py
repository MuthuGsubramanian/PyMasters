"""
Comprehensive tests for Google Play Billing verification in routes/payments.py.

Covers:
  * GET /api/payments/config exposes `google_play` alongside legacy Razorpay keys
  * Authentication enforcement (401 without valid JWT)
  * Input validation (unknown SKU, missing token, package_name mismatch -> 400)
  * Unconfigured Play credentials -> 503
  * Valid subscriptionsv2 (`pymasters_beginner_monthly`, `pymasters_pro_monthly`)
    and inapp (`pymasters_pro_30d`) purchases -> activates users.plan,
    plan_assigned_at, plan_expires_at, records `payments` ledger row, acknowledges
    pending tokens, and passes `access.get_access_status`
  * Idempotent retry by same user -> `already_processed: True` without duplicate Play call
  * Cross-user token replay guard (both DB ledger AND obfuscatedExternalAccountId) -> 403
  * Expired / canceled / pending / mismatched-product / 404 tokens -> 400 (no upgrade)
  * `_play_session()` credential loading (inline JSON, file path, ADC fallback)
"""

import json
import os
import sqlite3
import sys
import types
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("JWT_SECRET", "test-secret-long-enough-1234567890")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth
import access
from routes import payments


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


class FakePlaySession:
    def __init__(self, get_response: FakeResponse, post_response: FakeResponse = None):
        self.get_response = get_response
        self.post_response = post_response or FakeResponse(204, {})
        self.get_calls = []
        self.post_calls = []

    def get(self, url, timeout=15):
        self.get_calls.append((url, timeout))
        return self.get_response

    def post(self, url, json=None, timeout=10):
        self.post_calls.append((url, json, timeout))
        return self.post_response


@pytest.fixture()
def play_env(tmp_path, monkeypatch):
    db_path = str(tmp_path / "payments_test.db")
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT,
            created_at TIMESTAMP,
            plan TEXT DEFAULT 'free',
            plan_assigned_at TEXT,
            plan_expires_at TEXT,
            account_type TEXT DEFAULT 'individual',
            is_super_admin INTEGER DEFAULT 0,
            token_version INTEGER DEFAULT 0
        )
        """
    )
    conn.execute("CREATE TABLE org_members (org_id TEXT, user_id TEXT, role TEXT)")
    conn.execute(
        """
        CREATE TABLE organizations (
            id TEXT PRIMARY KEY, name TEXT, plan TEXT DEFAULT 'free',
            plan_expires_at TEXT, grandfathered INTEGER DEFAULT 0
        )
        """
    )
    old_created = (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=30)).strftime(
        "%Y-%m-%d %H:%M:%S"
    )
    conn.execute(
        "INSERT INTO users (id, username, created_at, plan) VALUES (?, ?, ?, 'free')",
        ["u_alice", "alice", old_created],
    )
    conn.execute(
        "INSERT INTO users (id, username, created_at, plan) VALUES (?, ?, ?, 'free')",
        ["u_bob", "bob", old_created],
    )
    conn.commit()
    conn.close()

    monkeypatch.setattr(payments, "DB_PATH", db_path)
    monkeypatch.setattr(auth, "_DB_PATH", db_path, raising=False)
    monkeypatch.setenv("DB_PATH", db_path)
    monkeypatch.delenv("RAZORPAY_KEY_ID", raising=False)
    monkeypatch.delenv("RAZORPAY_KEY_SECRET", raising=False)
    monkeypatch.delenv("PLAY_SERVICE_ACCOUNT_JSON", raising=False)
    monkeypatch.delenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", raising=False)
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    monkeypatch.delenv("GOOGLE_PLAY_BILLING_ENABLED", raising=False)
    monkeypatch.setenv("GOOGLE_PLAY_PACKAGE_NAME", "net.pymasters.app")

    app = FastAPI()
    app.include_router(payments.router)
    client = TestClient(app)

    alice_token = auth.create_access_token("u_alice", "alice", 0)
    bob_token = auth.create_access_token("u_bob", "bob", 0)

    return {
        "db_path": db_path,
        "client": client,
        "alice_headers": {"Authorization": f"Bearer {alice_token}"},
        "bob_headers": {"Authorization": f"Bearer {bob_token}"},
    }


def test_payment_config_includes_google_play_and_preserves_legacy_keys(play_env, monkeypatch):
    client = play_env["client"]
    res = client.get("/api/payments/config")
    assert res.status_code == 200
    body = res.json()
    assert body["enabled"] is False
    assert body["key_id"] == ""
    assert body["currency"] == "INR"
    assert set(body["plans"].keys()) == {"beginner", "pro"}
    assert body["google_play"] == {
        "enabled": False,
        "package_name": "net.pymasters.app",
        "products": {
            "beginner": "pymasters_beginner_monthly",
            "pro": "pymasters_pro_monthly",
        },
    }

    monkeypatch.setenv("PLAY_SERVICE_ACCOUNT_JSON", '{"type":"service_account"}')
    res2 = client.get("/api/payments/config")
    assert res2.status_code == 200
    assert res2.json()["google_play"]["enabled"] is True


def test_verify_requires_auth(play_env):
    res = play_env["client"].post(
        "/api/payments/google-play/verify",
        json={"product_id": "pymasters_pro_monthly", "purchase_token": "tok_123"},
    )
    assert res.status_code == 401


def test_verify_rejects_bad_inputs(play_env):
    c = play_env["client"]
    h = play_env["alice_headers"]

    # Missing token
    r1 = c.post(
        "/api/payments/google-play/verify",
        json={"product_id": "pymasters_pro_monthly", "purchase_token": "   "},
        headers=h,
    )
    assert r1.status_code == 400

    # Unknown product SKU
    r2 = c.post(
        "/api/payments/google-play/verify",
        json={"product_id": "evil_free_plan", "purchase_token": "tok_123"},
        headers=h,
    )
    assert r2.status_code == 400

    # Wrong package name
    r3 = c.post(
        "/api/payments/google-play/verify",
        json={
            "product_id": "pymasters_pro_monthly",
            "purchase_token": "tok_123",
            "package_name": "com.other.app",
        },
        headers=h,
    )
    assert r3.status_code == 400


def test_verify_returns_503_when_play_not_configured(play_env):
    res = play_env["client"].post(
        "/api/payments/google-play/verify",
        json={"product_id": "pymasters_pro_monthly", "purchase_token": "tok_unconfigured"},
        headers=play_env["alice_headers"],
    )
    assert res.status_code == 503


def test_verify_subscription_v2_activates_plan_acknowledges_and_handles_replay(play_env, monkeypatch):
    future_iso = (
        (datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=31))
        .strftime("%Y-%m-%dT%H:%M:%SZ")
    )
    fake_session = FakePlaySession(
        FakeResponse(
            200,
            {
                "subscriptionState": "SUBSCRIPTION_STATE_ACTIVE",
                "acknowledgementState": "ACKNOWLEDGEMENT_STATE_PENDING",
                "latestOrderId": "GPA.3311-2222-4444-55555",
                "externalAccountIdentifiers": {"obfuscatedExternalAccountId": "u_alice"},
                "lineItems": [
                    {
                        "productId": "pymasters_pro_monthly",
                        "expiryTime": future_iso,
                    }
                ],
            },
        )
    )
    monkeypatch.setattr(payments, "_play_session", lambda: fake_session)

    res = play_env["client"].post(
        "/api/payments/google-play/verify",
        json={
            "product_id": "pymasters_pro_monthly",
            "purchase_token": "tok/sub+pro#1",
            "package_name": "net.pymasters.app",
        },
        headers=play_env["alice_headers"],
    )
    assert res.status_code == 200
    assert res.json() == {"success": True, "plan": "pro"}

    # Verify URL encoding on purchase token + server-side acknowledge call
    assert len(fake_session.get_calls) == 1
    assert "subscriptionsv2/tokens/tok%2Fsub%2Bpro%231" in fake_session.get_calls[0][0]
    assert len(fake_session.post_calls) == 1
    assert ":acknowledge" in fake_session.post_calls[0][0]

    # Verify DB user plan + access resolver reports active 'pro' plan
    status = access.get_access_status(play_env["db_path"], "u_alice")
    assert status["status"] == "active"
    assert status["plan"] == "pro"

    conn = sqlite3.connect(play_env["db_path"])
    pay_row = conn.execute(
        "SELECT user_id, plan, amount, status, payment_id, receipt FROM payments"
    ).fetchone()
    user_row = conn.execute(
        "SELECT plan, plan_assigned_at, plan_expires_at FROM users WHERE id = 'u_alice'"
    ).fetchone()
    conn.close()
    assert pay_row == (
        "u_alice",
        "pro",
        99900,
        "paid",
        "GPA.3311-2222-4444-55555",
        "gplay:pymasters_pro_monthly",
    )
    assert user_row[0] == "pro"
    assert user_row[1] is not None
    assert user_row[2] == future_iso.replace("T", " ").replace("Z", "")

    # Idempotent retry by the SAME user returns already_processed without hitting Play API again
    res_retry = play_env["client"].post(
        "/api/payments/google-play/verify",
        json={"product_id": "pymasters_pro_monthly", "purchase_token": "tok/sub+pro#1"},
        headers=play_env["alice_headers"],
    )
    assert res_retry.status_code == 200
    assert res_retry.json() == {"success": True, "plan": "pro", "already_processed": True}
    assert len(fake_session.get_calls) == 1

    # Cross-user token replay by Bob MUST fail with 403 and keep Bob on free plan
    res_bob = play_env["client"].post(
        "/api/payments/google-play/verify",
        json={"product_id": "pymasters_pro_monthly", "purchase_token": "tok/sub+pro#1"},
        headers=play_env["bob_headers"],
    )
    assert res_bob.status_code == 403
    conn = sqlite3.connect(play_env["db_path"])
    bob_plan = conn.execute("SELECT plan FROM users WHERE id = 'u_bob'").fetchone()[0]
    conn.close()
    assert bob_plan == "free"


def test_verify_inapp_30d_pass_and_obfuscated_account_mismatch(play_env, monkeypatch):
    # First: obfuscatedExternalAccountId belongs to u_alice, called by u_bob -> 403
    mismatch_session = FakePlaySession(
        FakeResponse(
            200,
            {
                "productId": "pymasters_beginner_30d",
                "purchaseState": 0,
                "acknowledgementState": 1,
                "orderId": "GPA.1111-2222-3333-44444",
                "obfuscatedExternalAccountId": "u_alice",
            },
        )
    )
    monkeypatch.setattr(payments, "_play_session", lambda: mismatch_session)

    res_forbidden = play_env["client"].post(
        "/api/payments/google-play/verify",
        json={"product_id": "pymasters_beginner_30d", "purchase_token": "tok_inapp_1"},
        headers=play_env["bob_headers"],
    )
    assert res_forbidden.status_code == 403

    # Now called by rightful owner u_alice (with pending acknowledgementState == 0)
    valid_inapp_session = FakePlaySession(
        FakeResponse(
            200,
            {
                "productId": "pymasters_beginner_30d",
                "purchaseState": 0,
                "acknowledgementState": 0,
                "orderId": "GPA.1111-2222-3333-44444",
                "obfuscatedExternalAccountId": "u_alice",
            },
        )
    )
    monkeypatch.setattr(payments, "_play_session", lambda: valid_inapp_session)

    res_ok = play_env["client"].post(
        "/api/payments/google-play/verify",
        json={"product_id": "pymasters_beginner_30d", "purchase_token": "tok_inapp_1"},
        headers=play_env["alice_headers"],
    )
    assert res_ok.status_code == 200
    assert res_ok.json() == {"success": True, "plan": "beginner"}
    assert len(valid_inapp_session.post_calls) == 1
    assert "purchases/products/pymasters_beginner_30d/tokens/tok_inapp_1:acknowledge" in (
        valid_inapp_session.post_calls[0][0]
    )

    status = access.get_access_status(play_env["db_path"], "u_alice")
    assert status["status"] == "active"
    assert status["plan"] == "beginner"


@pytest.mark.parametrize(
    "status_code,payload",
    [
        (404, {"error": {"message": "Token not found"}}),
        (
            200,
            {
                "subscriptionState": "SUBSCRIPTION_STATE_EXPIRED",
                "lineItems": [{"productId": "pymasters_pro_monthly", "expiryTime": "2025-01-01T00:00:00Z"}],
            },
        ),
        (
            200,
            {
                "subscriptionState": "SUBSCRIPTION_STATE_PENDING",
                "lineItems": [{"productId": "pymasters_pro_monthly"}],
            },
        ),
        (
            200,
            {
                # Token is for beginner, but client claimed pro!
                "subscriptionState": "SUBSCRIPTION_STATE_ACTIVE",
                "lineItems": [{"productId": "pymasters_beginner_monthly", "expiryTime": "2029-01-01T00:00:00Z"}],
            },
        ),
    ],
)
def test_verify_rejects_invalid_or_tampered_play_states(play_env, monkeypatch, status_code, payload):
    monkeypatch.setattr(payments, "_play_session", lambda: FakePlaySession(FakeResponse(status_code, payload)))
    res = play_env["client"].post(
        "/api/payments/google-play/verify",
        json={"product_id": "pymasters_pro_monthly", "purchase_token": "tok_bad_state"},
        headers=play_env["alice_headers"],
    )
    assert res.status_code == 400
    conn = sqlite3.connect(play_env["db_path"])
    plan = conn.execute("SELECT plan FROM users WHERE id = 'u_alice'").fetchone()[0]
    conn.close()
    assert plan == "free"


def test_play_session_credential_loading_modes(tmp_path, monkeypatch):
    captured = {}

    google_mod = types.ModuleType("google")
    auth_mod = types.ModuleType("google.auth")
    oauth2_mod = types.ModuleType("google.oauth2")
    sa_mod = types.ModuleType("google.oauth2.service_account")
    transport_mod = types.ModuleType("google.auth.transport")
    requests_mod = types.ModuleType("google.auth.transport.requests")

    class DummyCreds:
        def __init__(self, source, scopes):
            self.source = source
            self.scopes = scopes

    class DummyServiceAccountCreds:
        @staticmethod
        def from_service_account_info(info, scopes=None):
            captured["info"] = info
            return DummyCreds("info", scopes)

        @staticmethod
        def from_service_account_file(filename, scopes=None):
            captured["file"] = filename
            return DummyCreds("file", scopes)

    def dummy_default(scopes=None):
        captured["default_scopes"] = scopes
        return DummyCreds("adc", scopes), "proj-test"

    class DummyAuthorizedSession:
        def __init__(self, creds):
            self.creds = creds

    auth_mod.default = dummy_default
    sa_mod.Credentials = DummyServiceAccountCreds
    requests_mod.AuthorizedSession = DummyAuthorizedSession
    google_mod.auth = auth_mod
    google_mod.oauth2 = oauth2_mod
    oauth2_mod.service_account = sa_mod

    monkeypatch.setitem(sys.modules, "google", google_mod)
    monkeypatch.setitem(sys.modules, "google.auth", auth_mod)
    monkeypatch.setitem(sys.modules, "google.oauth2", oauth2_mod)
    monkeypatch.setitem(sys.modules, "google.oauth2.service_account", sa_mod)
    monkeypatch.setitem(sys.modules, "google.auth.transport", transport_mod)
    monkeypatch.setitem(sys.modules, "google.auth.transport.requests", requests_mod)

    # 1. Inline JSON string
    monkeypatch.setenv("PLAY_SERVICE_ACCOUNT_JSON", json.dumps({"client_email": "play@pymasters.iam"}))
    s1 = payments._play_session()
    assert s1.creds.source == "info"
    assert captured["info"]["client_email"] == "play@pymasters.iam"

    # 2. File path
    sa_file = tmp_path / "sa.json"
    sa_file.write_text('{"client_email": "file@pymasters.iam"}')
    monkeypatch.setenv("PLAY_SERVICE_ACCOUNT_JSON", str(sa_file))
    s2 = payments._play_session()
    assert s2.creds.source == "file"
    assert captured["file"] == str(sa_file)

    # 3. Cloud Run ADC fallback when GOOGLE_PLAY_BILLING_ENABLED=true
    monkeypatch.delenv("PLAY_SERVICE_ACCOUNT_JSON", raising=False)
    monkeypatch.setenv("GOOGLE_PLAY_BILLING_ENABLED", "true")
    s3 = payments._play_session()
    assert s3.creds.source == "adc"
    assert payments.ANDROID_PUBLISHER_SCOPE in captured["default_scopes"]
