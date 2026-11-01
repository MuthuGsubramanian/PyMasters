"""lesson_order() replaces a per-request scan of every lesson file in /api/arcade/catalog
(it froze the 1 GB production VM). It must rank exactly like the old scan and be cached."""
import glob
import json

from arcade import unlocks


def _old_next_lesson(done, backed):
    best = None
    for path in glob.glob(str(unlocks.LESSONS_DIR / "*" / "*.json")):
        try:
            with open(path, encoding="utf-8") as fh:
                d = json.load(fh)
        except Exception:
            continue
        if d.get("topic") not in backed or d.get("id") in done:
            continue
        rank = (0 if d.get("track") == "python_fundamentals" else 1 if d.get("track") == "dsa" else 2,
                d.get("order") or 99, d.get("id"))
        if best is None or rank < best[0]:
            best = (rank, d["id"])
    return best[1] if best else None


def _new_next_lesson(done, backed):
    return next((lid for _r, lid, topic in unlocks.lesson_order() if topic in backed and lid not in done), None)


def test_lesson_order_matches_old_scan():
    backed = unlocks.drill_backed_topics()
    done = set()
    for _ in range(5):  # walk the first few "next lesson" steps, completing each in turn
        old, new = _old_next_lesson(done, backed), _new_next_lesson(done, backed)
        assert old == new
        if new is None:
            break
        done.add(new)


def test_lesson_order_is_cached():
    assert unlocks.lesson_order() is unlocks.lesson_order()
