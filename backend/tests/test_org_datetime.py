"""
Phase 9: replacing deprecated datetime.utcnow() with timezone-aware equivalents
must NOT break expiry comparisons against values stored the old (naive) way.
"""
from datetime import datetime, timezone

from routes.organizations import _utcnow, _as_utc


def test_utcnow_is_timezone_aware():
    now = _utcnow()
    assert now.tzinfo is not None
    assert now.utcoffset() == timezone.utc.utcoffset(None)


def test_as_utc_upgrades_legacy_naive_value():
    # A timestamp stored by the OLD code: naive ISO, no offset.
    legacy = datetime.fromisoformat("2020-01-01T00:00:00")
    assert legacy.tzinfo is None
    aware = _as_utc(legacy)
    assert aware.tzinfo is not None
    # Comparing a legacy naive value against aware now must NOT raise TypeError.
    assert aware < _utcnow()


def test_as_utc_passes_through_aware_value():
    # A timestamp stored by the NEW code: aware ISO with +00:00.
    new = datetime.fromisoformat("2020-01-01T00:00:00+00:00")
    assert new.tzinfo is not None
    assert _as_utc(new) < _utcnow()
