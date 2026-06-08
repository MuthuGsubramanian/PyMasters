"""
Tests for fail-closed JWT secret handling.

A blank or default signing secret in production lets anyone forge admin tokens,
so the app must refuse to run with one when deployed (Cloud Run sets K_SERVICE).
Locally it stays permissive so dev just works.
"""
import pytest

import auth

INSECURE_DEFAULT = "dev-insecure-secret-change-me"
STRONG = "Xa9_strong-random-signing-secret-of-sufficient-length-1234"


def test_default_secret_rejected_in_production():
    with pytest.raises(RuntimeError):
        auth.assert_secret_is_safe(INSECURE_DEFAULT, is_production=True)


def test_blank_secret_rejected_in_production():
    with pytest.raises(RuntimeError):
        auth.assert_secret_is_safe("", is_production=True)


def test_short_secret_rejected_in_production():
    with pytest.raises(RuntimeError):
        auth.assert_secret_is_safe("short", is_production=True)


def test_strong_secret_accepted_in_production():
    auth.assert_secret_is_safe(STRONG, is_production=True)  # must not raise


def test_default_secret_allowed_in_dev():
    auth.assert_secret_is_safe(INSECURE_DEFAULT, is_production=False)  # must not raise


def test_is_production_detects_cloud_run(monkeypatch):
    monkeypatch.setenv("K_SERVICE", "pymasters")
    assert auth.is_production() is True


def test_is_production_false_locally(monkeypatch):
    monkeypatch.delenv("K_SERVICE", raising=False)
    assert auth.is_production() is False
