"""Regression tests for SEC-1: bcrypt password hashing + legacy migration support."""
import os, sys, hashlib
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import main


def test_new_passwords_use_bcrypt():
    h = main.hash_pw("Sup3r!secret")
    assert h.startswith("$2"), "new passwords must be bcrypt"
    assert h != hashlib.sha256(b"Sup3r!secret").hexdigest()


def test_verify_bcrypt():
    h = main.hash_pw("Sup3r!secret")
    assert main.verify_pw("Sup3r!secret", h) is True
    assert main.verify_pw("wrong", h) is False


def test_verify_legacy_sha256_still_works():
    legacy = hashlib.sha256("oldpass".encode()).hexdigest()
    assert main.verify_pw("oldpass", legacy) is True
    assert main.verify_pw("nope", legacy) is False


def test_verify_handles_empty():
    assert main.verify_pw("x", "") is False
    assert main.verify_pw("x", None) is False
