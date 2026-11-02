"""/api/classroom/catalog-stats counts the anonymous catalogue (2026-11-02): the landing page showed two
contradicting hardcoded totals (380+ and 425+) while learners could actually see 432."""
import routes.classroom as classroom
from access import ENTERPRISE_TRACKS


def test_counts_what_an_anonymous_visitor_sees(monkeypatch):
    enterprise = next(iter(ENTERPRISE_TRACKS))
    cached = [
        {"id": "a", "track": "python_fundamentals", "title": "A"},
        {"id": "b", "track": "python_fundamentals", "title": "B"},
        {"id": "c", "track": "dsa", "title": "C"},
        {"id": "d", "track": enterprise, "title": "D"},   # hidden from anonymous visitors
    ]
    monkeypatch.setattr(classroom, "_list_all_lessons", lambda user_id=None: cached)
    assert classroom.catalog_stats() == {"lessons": 3, "tracks": 2}
